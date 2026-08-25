using Microsoft.Data.Sqlite;

var dbPath = @"..\GrizzlyPlatform.Api\grizzlyplatform.db";

using var connection = new SqliteConnection($"Data Source={dbPath}");
connection.Open();

Console.WriteLine("=== MATCH DATABASE CHECK ===");
Console.WriteLine();

var countCommand = connection.CreateCommand();
countCommand.CommandText = "SELECT COUNT(*) FROM Matches;";
var count = countCommand.ExecuteScalar();

Console.WriteLine($"Total matches: {count}");
Console.WriteLine();

var breakdownCommand = connection.CreateCommand();
breakdownCommand.CommandText = """
    SELECT MatchType, COUNT(*) AS Count
    FROM Matches
    GROUP BY MatchType
    ORDER BY
        CASE MatchType
            WHEN 'Qualification' THEN 1
            WHEN 'EighthFinal' THEN 2
            WHEN 'Quarterfinal' THEN 3
            WHEN 'Semifinal' THEN 4
            WHEN 'Final' THEN 5
            ELSE 6
        END;
    """;

using (var reader = breakdownCommand.ExecuteReader())
{
    Console.WriteLine("Match type breakdown:");
    Console.WriteLine("---------------------");

    while (reader.Read())
    {
        Console.WriteLine($"{reader["MatchType"],-15} {reader["Count"]}");
    }
}

Console.WriteLine();

var duplicateCommand = connection.CreateCommand();
duplicateCommand.CommandText = """
    SELECT EventId, MatchType, MatchNumber, SetNumber, COUNT(*) AS Count
    FROM Matches
    GROUP BY EventId, MatchType, MatchNumber, SetNumber
    HAVING COUNT(*) > 1;
    """;

using (var reader = duplicateCommand.ExecuteReader())
{
    if (!reader.Read())
    {
        Console.WriteLine("Duplicate matches: NONE");
    }
    else
    {
        Console.WriteLine("DUPLICATES FOUND:");

        do
        {
            Console.WriteLine(
                $"Event {reader["EventId"]} | " +
                $"{reader["MatchType"]} | " +
                $"Match {reader["MatchNumber"]} | " +
                $"Set {reader["SetNumber"]} | " +
                $"Count {reader["Count"]}");
        }
        while (reader.Read());
    }
}

Console.WriteLine();

var matchesCommand = connection.CreateCommand();
matchesCommand.CommandText = """
    SELECT Id, MatchType, MatchNumber, SetNumber
    FROM Matches
    ORDER BY
        CASE MatchType
            WHEN 'Qualification' THEN 1
            WHEN 'EighthFinal' THEN 2
            WHEN 'Quarterfinal' THEN 3
            WHEN 'Semifinal' THEN 4
            WHEN 'Final' THEN 5
            ELSE 6
        END,
        MatchNumber,
        SetNumber;
    """;

using (var reader = matchesCommand.ExecuteReader())
{
    Console.WriteLine("Matches:");
    Console.WriteLine("ID   | Type            | Match | Set");
    Console.WriteLine("-------------------------------------");

    while (reader.Read())
    {
        Console.WriteLine(
            $"{reader["Id"],-4} | " +
            $"{reader["MatchType"],-15} | " +
            $"{reader["MatchNumber"],-5} | " +
            $"{reader["SetNumber"]}");
    }
}
