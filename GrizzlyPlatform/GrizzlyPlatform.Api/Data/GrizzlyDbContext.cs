using GrizzlyPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Data;

public class GrizzlyDbContext : DbContext
{
    public GrizzlyDbContext(DbContextOptions<GrizzlyDbContext> options)
        : base(options)
    {
    }

    public DbSet<Team> Teams { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<Season> Seasons { get; set; }
    public DbSet<GameForm> GameForms { get; set; }
    public DbSet<GameFormField> GameFormFields { get; set; }
    public DbSet<GameFormFieldOption> GameFormFieldOptions { get; set; }
    public DbSet<GameFormSubmission> GameFormSubmissions { get; set; }
    public DbSet<GameFormAnswer> GameFormAnswers { get; set; }
    public DbSet<Event> Events { get; set; }
    public DbSet<EventTeam> EventTeams { get; set; }
    public DbSet<Match> Matches { get; set; }
    public DbSet<ActiveScoutingConfiguration>
    ActiveScoutingConfigurations { get; set; }

    public DbSet<AllianceSelection> AllianceSelections { get; set; }
    public DbSet<Alliance> Alliances { get; set; }
    public DbSet<AllianceMember> AllianceMembers { get; set; }
    public DbSet<AlliancePick> AlliancePicks { get; set; }
    public DbSet<AllianceRankedTeam> AllianceRankedTeams { get; set; }


    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Match>()
            .HasIndex(m => new
            {
                m.EventId,
                m.MatchType,
                m.MatchNumber,
                m.SetNumber
            })
            .IsUnique();

        modelBuilder.Entity<Match>()
            .HasOne(m => m.Event)
            .WithMany()
            .HasForeignKey(m => m.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Match>()
            .HasOne(m => m.RedTeam1)
            .WithMany()
            .HasForeignKey(m => m.RedTeam1Id)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Match>()
            .HasOne(m => m.RedTeam2)
            .WithMany()
            .HasForeignKey(m => m.RedTeam2Id)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Match>()
            .HasOne(m => m.RedTeam3)
            .WithMany()
            .HasForeignKey(m => m.RedTeam3Id)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Match>()
            .HasOne(m => m.BlueTeam1)
            .WithMany()
            .HasForeignKey(m => m.BlueTeam1Id)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Match>()
            .HasOne(m => m.BlueTeam2)
            .WithMany()
            .HasForeignKey(m => m.BlueTeam2Id)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Match>()
            .HasOne(m => m.BlueTeam3)
            .WithMany()
            .HasForeignKey(m => m.BlueTeam3Id)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<GameForm>()
            .HasMany(g => g.Fields)
            .WithOne(f => f.GameForm)
            .HasForeignKey(f => f.GameFormId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<GameFormField>()
            .HasMany(f => f.Options)
            .WithOne(o => o.GameFormField)
            .HasForeignKey(o => o.GameFormFieldId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ActiveScoutingConfiguration>()
            .HasOne<GameForm>()
            .WithMany()
            .HasForeignKey(c => c.ActivePitFormId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<ActiveScoutingConfiguration>()
            .HasOne<GameForm>()
            .WithMany()
            .HasForeignKey(c => c.ActiveMatchFormId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<AllianceSelection>()
            .HasOne(a => a.Event)
            .WithMany()
            .HasForeignKey(a => a.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Alliance>()
            .HasOne(a => a.AllianceSelection)
            .WithMany(s => s.Alliances)
            .HasForeignKey(a => a.AllianceSelectionId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Alliance>()
            .HasOne(a => a.CaptainTeam)
            .WithMany()
            .HasForeignKey(a => a.CaptainTeamId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<AllianceMember>()
            .HasOne(m => m.Alliance)
            .WithMany(a => a.Members)
            .HasForeignKey(m => m.AllianceId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AllianceMember>()
            .HasOne(m => m.Team)
            .WithMany()
            .HasForeignKey(m => m.TeamId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<AlliancePick>()
            .HasOne(p => p.AllianceSelection)
            .WithMany(s => s.Picks)
            .HasForeignKey(p => p.AllianceSelectionId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AlliancePick>()
            .HasOne(p => p.InvitingTeam)
            .WithMany()
            .HasForeignKey(p => p.InvitingTeamId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<AlliancePick>()
            .HasOne(p => p.InvitedTeam)
            .WithMany()
            .HasForeignKey(p => p.InvitedTeamId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Alliance>()
            .HasIndex(a => new
            {
                a.AllianceSelectionId,
                a.AllianceNumber
            })
            .IsUnique();

        modelBuilder.Entity<AllianceMember>()
            .HasIndex(m => new
            {
                m.AllianceId,
                m.TeamId
            })
            .IsUnique();
    }
}



