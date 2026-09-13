using System.Collections.Concurrent;
using System.Text.Json;
using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Services;

public class EventSyncService(GrizzlyDbContext db, TheBlueAllianceService source)
{
    public static readonly string[] Resources = ["teams", "matches", "rankings"];
    private static readonly ConcurrentDictionary<(int, string), SemaphoreSlim> Gates = new();

    public static async Task<EventSyncState> State(GrizzlyDbContext db, int eventId, string resource)
    {
        var state = await db.EventSyncStates.FindAsync(eventId, resource);
        if (state != null) return state;
        state = new EventSyncState { EventId = eventId, Resource = resource };
        db.EventSyncStates.Add(state);
        return state;
    }

    public static async Task MarkManual(GrizzlyDbContext db, int eventId, string resource)
    {
        var state = await State(db, eventId, resource);
        state.ManualMode = true;
        state.Revision++;
        state.LastChangedAt = DateTime.UtcNow;
        state.Outcome = "Manual";
        state.Message = "Manual corrections saved. Automatic updates are paused for this category.";
    }

    public async Task<EventSyncState> SyncAsync(int eventId, string resource, CancellationToken token = default)
    {
        if (!Resources.Contains(resource)) throw new ArgumentException("Unknown sync category.");
        var gate = Gates.GetOrAdd((eventId, resource), _ => new SemaphoreSlim(1, 1));
        if (!await gate.WaitAsync(0, token))
            return new EventSyncState { EventId = eventId, Resource = resource, Outcome = "Busy", Message = "A sync is already running." };
        long revision = -1;
        try
        {
            string eventKey;
            await using (var transaction = await db.Database.BeginTransactionAsync(token))
            {
                db.ChangeTracker.Clear();
                var eventItem = await db.Events.FindAsync([eventId], token)
                    ?? throw new KeyNotFoundException("Event not found.");
                var state = await State(db, eventId, resource);
                if (state.ManualMode) return state;
                revision = state.Revision;
                state.LastAttemptAt = DateTime.UtcNow;
                state.Outcome = "Checking";
                state.Message = "Checking The Blue Alliance...";
                eventKey = eventItem.BlueAllianceKey ?? "";
                await db.SaveChangesAsync(token);
                await transaction.CommitAsync(token);
            }
            if (string.IsNullOrWhiteSpace(eventKey))
                throw new InvalidOperationException("This event has no The Blue Alliance key. Manual data is available.");
            var json = resource switch
            {
                "teams" => await source.GetEventTeamsAsync(eventKey, token),
                "matches" => await source.GetEventMatchesAsync(eventKey, token),
                _ => await source.GetEventRankingsAsync(eventKey, token)
            };
            // Validate every record before changing tracked entities.
            var teamRows = resource == "teams" ? ParseTeams(json) : null;
            var matchRows = resource == "matches" ? ParseMatches(json) : null;
            var rankRows = resource == "rankings" ? ParseRankings(json) : null;
            await using (var transaction = await db.Database.BeginTransactionAsync(token))
            {
                db.ChangeTracker.Clear();
                var state = await State(db, eventId, resource);
                if (state.ManualMode || state.Revision != revision) return state;
                var currentEvent = await db.Events.FindAsync([eventId], token);
                if (currentEvent?.BlueAllianceKey != eventKey)
                    throw new InvalidOperationException("Event configuration changed while syncing. Retry.");
                int changed = resource switch
                {
                    "teams" => await ApplyTeams(eventId, teamRows!),
                    "matches" => await ApplyMatches(eventId, matchRows!),
                    _ => await ApplyRankings(eventId, rankRows!)
                };
                state.LastSuccessAt = DateTime.UtcNow;
                if (changed > 0)
                {
                    state.LastChangedAt = state.LastSuccessAt;
                    state.Revision++;
                }
                state.Outcome = changed > 0 ? "Updated" : "Unchanged";
                state.Message = changed > 0 ? $"Updated {changed} records." : "Connected successfully; no new data.";
                await db.SaveChangesAsync(token);
                await transaction.CommitAsync(token);
                return state;
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }

        catch (Exception ex)
        {
            db.ChangeTracker.Clear();
            if (!await db.Events.AnyAsync(e => e.Id == eventId, token)) return new EventSyncState { EventId = eventId, Resource = resource, Outcome = "Failed", Message = "Event no longer exists." };
            await using var transaction = await db.Database.BeginTransactionAsync(token);
            var state = await State(db, eventId, resource);
            if (!state.ManualMode && state.Revision == revision)
            {
                state.Outcome = ex is InvalidDataException ? "Preserved" : "Failed";
                state.Message = ex is OperationCanceledException
                    ? "The request timed out. Saved data was kept."
                    : $"{ex.Message} Saved data was kept.";
                await db.SaveChangesAsync(token);
                await transaction.CommitAsync(token);
            }
            return state;
        }
        finally { gate.Release(); }
    }

    private static void Require(bool valid, string message)
    {
        if (!valid) throw new InvalidDataException(message);
    }
    private static List<JsonElement> Array(JsonElement value)
    {
        Require(value.ValueKind == JsonValueKind.Array && value.GetArrayLength() > 0,
            "The source returned no usable records.");
        return value.EnumerateArray().ToList();
    }
    private static int Number(string? key)
    {
        Require(key != null && key.StartsWith("frc") && int.TryParse(key.AsSpan(3), out var n) && n > 0, "Invalid team key.");
        return int.Parse(key![3..]);
    }
    private record TeamRow(int Number, string Name, string Location);
    private static List<TeamRow> ParseTeams(JsonElement json)
    {
        var rows = Array(json).Select(t => new TeamRow(t.GetProperty("team_number").GetInt32(),
            t.TryGetProperty("nickname", out var name) && name.ValueKind == JsonValueKind.String ? name.GetString()! : "",
            string.Join(", ", new[] { "city", "state_prov", "country" }.Select(k =>
                t.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null)
                .Where(v => !string.IsNullOrWhiteSpace(v))))).ToList();
        Require(rows.All(t => t.Number > 0) && rows.Select(t => t.Number).Distinct().Count() == rows.Count, "Invalid or duplicate team roster.");
        return rows;
    }
    private record MatchRow(string Type, int Number, int Set, int[] Teams, int? Red, int? Blue);
    private static List<MatchRow> ParseMatches(JsonElement json)
    {
        var rows = Array(json).Select(m =>
        {
            string type = m.GetProperty("comp_level").GetString() switch
            {
                "qm" => "Qualification", "ef" => "EighthFinal", "qf" => "Quarterfinal",
                "sf" => "Semifinal", "f" => "Final", _ => throw new InvalidDataException("Unknown match type.")
            };
            var red = m.GetProperty("alliances").GetProperty("red");
            var blue = m.GetProperty("alliances").GetProperty("blue");
            var redTeams = Array(red.GetProperty("team_keys")).Select(t => Number(t.GetString())).ToArray();
            var blueTeams = Array(blue.GetProperty("team_keys")).Select(t => Number(t.GetString())).ToArray();
            Require(redTeams.Length == 3 && blueTeams.Length == 3, "A match must contain six teams.");
            var teams = redTeams.Concat(blueTeams).ToArray();
            int redScore = red.GetProperty("score").GetInt32(), blueScore = blue.GetProperty("score").GetInt32();
            Require(redScore >= -1 && blueScore >= -1 && (redScore == -1) == (blueScore == -1), "Invalid match scores.");
            int number = m.GetProperty("match_number").GetInt32();
            int set = m.GetProperty("set_number").GetInt32();
            Require(number > 0 && set >= 0 && teams.Distinct().Count() == 6, "Invalid match schedule.");
            return new MatchRow(type, number, set, teams, redScore < 0 ? null : redScore, blueScore < 0 ? null : blueScore);
        }).ToList();
        Require(rows.Select(m => (m.Type, m.Number, m.Set)).Distinct().Count() == rows.Count, "Duplicate source matches.");
        return rows;
    }
    private record RankRow(int Number, int Rank, int Points, double? Tie1, double? Tie2);
    private static List<RankRow> ParseRankings(JsonElement json)
    {
        Require(json.ValueKind == JsonValueKind.Object && json.TryGetProperty("rankings", out _), "Invalid rankings response.");
        var rows = Array(json.GetProperty("rankings")).Select(r =>
        {
            int points = 0;
            if (r.TryGetProperty("extra_stats", out var extras) && extras.ValueKind == JsonValueKind.Array && extras.GetArrayLength() > 0)
                extras[0].TryGetInt32(out points);
            double? Tie(int index) => r.TryGetProperty("sort_orders", out var orders) &&
                orders.ValueKind == JsonValueKind.Array && orders.GetArrayLength() > index &&
                orders[index].TryGetDouble(out var value) && double.IsFinite(value) ? value : null;
            return new RankRow(Number(r.GetProperty("team_key").GetString()), r.GetProperty("rank").GetInt32(), points, Tie(1), Tie(2));
        }).ToList();
        Require(rows.Select(r => r.Number).Distinct().Count() == rows.Count &&
            rows.Select(r => r.Rank).Order().SequenceEqual(Enumerable.Range(1, rows.Count)), "Incomplete or duplicate ranking order.");
        return rows;
    }
    private async Task<int> ApplyTeams(int eventId, List<TeamRow> rows)
    {
        int changed = 0;
        var teams = await db.Teams.ToListAsync();
        var members = await db.EventTeams.Where(t => t.EventId == eventId).ToListAsync();
        foreach (var row in rows)
        {
            var team = teams.FirstOrDefault(t => t.TeamNumber == row.Number);
            if (team == null)
            {
                team = new Team { TeamNumber = row.Number, Name = string.IsNullOrWhiteSpace(row.Name) ? $"Team {row.Number}" : row.Name, Location = row.Location };
                db.Teams.Add(team);
                teams.Add(team);
            }
            // Preserve local team names/corrections; roster imports are additive.
            if (!members.Any(t => t.TeamId == team.Id) || team.Id == 0)
            {
                var member = new EventTeam { EventId = eventId, Team = team };
                db.EventTeams.Add(member);
                members.Add(member);
                changed++;
            }
        }
        return changed;
    }
    private async Task<int> ApplyMatches(int eventId, List<MatchRow> rows)
    {
        var teams = await db.Teams.ToListAsync();
        var ids = teams.ToDictionary(t => t.TeamNumber, t => t.Id);
        Require(rows.SelectMany(r => r.Teams).All(ids.ContainsKey), "Some scheduled teams are missing locally. Sync teams first.");
        var existing = await db.Matches.Where(m => m.EventId == eventId).ToListAsync();
        Require(existing.All(m => rows.Any(r => r.Type == m.MatchType && r.Number == m.MatchNumber && r.Set == m.SetNumber)),
            "The schedule is missing previously saved matches.");
        var submitted = await db.GameFormSubmissions.Where(s => s.MatchId != null).Select(s => s.MatchId!.Value).Distinct().ToListAsync();
        int changed = 0;
        foreach (var row in rows)
        {
            var m = existing.FirstOrDefault(m => m.MatchType == row.Type && m.MatchNumber == row.Number && m.SetNumber == row.Set);
            var teamIds = row.Teams.Select(n => ids[n]).ToArray();
            if (m != null)
            {
                int[] previous = [m.RedTeam1Id, m.RedTeam2Id, m.RedTeam3Id, m.BlueTeam1Id, m.BlueTeam2Id, m.BlueTeam3Id];
                Require(!submitted.Contains(m.Id) || previous.SequenceEqual(teamIds),
                    "The source changed teams for a match with scouting submissions. Review the schedule manually.");
                Require(!(m.RedScore.HasValue && !row.Red.HasValue), "The source returned unplayed scores for a completed match.");
                if (previous.SequenceEqual(teamIds) && m.RedScore == row.Red && m.BlueScore == row.Blue) continue;
            }
            else
            {
                m = new Match { EventId = eventId, MatchType = row.Type, MatchNumber = row.Number, SetNumber = row.Set };
                db.Matches.Add(m);
            }
            m.RedTeam1Id = teamIds[0]; m.RedTeam2Id = teamIds[1]; m.RedTeam3Id = teamIds[2];
            m.BlueTeam1Id = teamIds[3]; m.BlueTeam2Id = teamIds[4]; m.BlueTeam3Id = teamIds[5];
            m.RedScore = row.Red; m.BlueScore = row.Blue;
            m.WinningAlliance = row.Red == null || row.Red == row.Blue ? "" : row.Red > row.Blue ? "red" : "blue";
            changed++;
        }
        return changed;
    }
    private async Task<int> ApplyRankings(int eventId, List<RankRow> rows)
    {
        var teams = await db.Teams.ToListAsync();
        var ids = teams.ToDictionary(t => t.TeamNumber, t => t.Id);
        Require(rows.All(r => ids.ContainsKey(r.Number)), "Ranked teams are missing locally. Sync teams first.");
        var mapped = rows.Select(r => new EventRanking { EventId = eventId, TeamId = ids[r.Number],
            Rank = r.Rank, RankingPoints = r.Points, TieBreaker1 = r.Tie1, TieBreaker2 = r.Tie2 }).ToList();
        var old = await db.EventRankings.Where(r => r.EventId == eventId).ToListAsync();
        // Blue Alliance rankings are authoritative for teams that have completed ranking data.
        // Do not reject the whole payload because a local roster contains an extra/unranked team.
        Require(old.Select(r => r.TeamId).All(id => mapped.Any(r => r.TeamId == id)),
            "Previously saved rankings are missing from the source response.");
        if (old.Count == mapped.Count && old.All(o => mapped.Any(n => n.TeamId == o.TeamId && n.Rank == o.Rank &&
            n.RankingPoints == o.RankingPoints && n.TieBreaker1 == o.TieBreaker1 && n.TieBreaker2 == o.TieBreaker2))) return 0;
        db.EventRankings.RemoveRange(old);
        await db.SaveChangesAsync(); // Within the caller's transaction, before inserting swapped unique ranks.
        db.EventRankings.AddRange(mapped);
        return mapped.Count;
    }
}
