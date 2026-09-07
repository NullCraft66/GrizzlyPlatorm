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
    }
}


