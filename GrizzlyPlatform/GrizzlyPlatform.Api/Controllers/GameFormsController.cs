using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using GrizzlyPlatform.Api.Dtos;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GameFormsController : ControllerBase
{
    private readonly GrizzlyDbContext _context;

    public GameFormsController(GrizzlyDbContext context)
    {
        _context = context;
    }

    // GET: api/GameForms
 // GET: api/GameForms
[HttpGet]
public async Task<IActionResult> GetGameForms()
{
    var gameForms = await _context.GameForms
        .Include(g => g.Fields)
            .ThenInclude(f => f.Options)
        .Select(g => new GameFormDto
        {
            Id = g.Id,
            SeasonId = g.SeasonId,
            Name = g.Name,
            Description = g.Description,
            FormType = (int)g.FormType,

            Fields = g.Fields
                .OrderBy(f => f.DisplayOrder)
                .Select(f => new GameFormFieldDto
                {
                    Id = f.Id,
                    Question = f.Question,
                    Description = f.Description,
                    FieldType = (int)f.FieldType,
                    Required = f.Required,
                    DisplayOrder = f.DisplayOrder,
                    IsSystemField = f.IsSystemField,

                    Options = f.Options
                        .OrderBy(o => o.DisplayOrder)
                        .Select(o => new GameFormFieldOptionDto
                        {
                            Id = o.Id,
                            Value = o.Value,
                            DisplayOrder = o.DisplayOrder
                        })
                        .ToList()
                })
                .ToList()
        })
        .ToListAsync();

    return Ok(gameForms);
}

   // GET: api/GameForms/1
[HttpGet("{id}")]
public async Task<IActionResult> GetGameForm(int id)
{
    var gameForm = await _context.GameForms
        .Include(g => g.Fields)
            .ThenInclude(f => f.Options)
        .FirstOrDefaultAsync(g => g.Id == id);

    if (gameForm == null)
    {
        return NotFound();
    }

    var result = new GameFormDto
    {
        Id = gameForm.Id,
        SeasonId = gameForm.SeasonId,
        Name = gameForm.Name,
        Description = gameForm.Description,
        FormType = (int)gameForm.FormType,

        Fields = gameForm.Fields
            .OrderBy(f => f.DisplayOrder)
            .Select(f => new GameFormFieldDto
            {
                Id = f.Id,
                Question = f.Question,
                Description = f.Description,
                FieldType = (int)f.FieldType,
                Required = f.Required,
                DisplayOrder = f.DisplayOrder,
                IsSystemField = f.IsSystemField,

                Options = f.Options
                    .OrderBy(o => o.DisplayOrder)
                    .Select(o => new GameFormFieldOptionDto
                    {
                        Id = o.Id,
                        Value = o.Value,
                        DisplayOrder = o.DisplayOrder
                    })
                    .ToList()
            })
            .ToList()
    };

    return Ok(result);
}

  // POST: api/GameForms
[HttpPost]
public async Task<IActionResult> CreateGameForm(GameForm gameForm)
{
    var season = await _context.Seasons
        .FindAsync(gameForm.SeasonId);

    if (season == null)
    {
        return BadRequest(
            "The specified season does not exist.");
    }

// Automatically add required system fields.
if (gameForm.FormType == GameFormType.Pit)
{
    gameForm.Fields.Add(new GameFormField
    {
        Question = "Scout Name",
        Description = "Name or initials of the person conducting the pit scouting.",
        FieldType = GameFormFieldType.Text,
        Required = true,
        DisplayOrder = 1,
        IsSystemField = true
    });

    gameForm.Fields.Add(new GameFormField
    {
        Question = "Team Number",
        Description = "FRC team number being scouted.",
        FieldType = GameFormFieldType.Number,
        Required = true,
        DisplayOrder = 2,
        IsSystemField = true
    });

    gameForm.Fields.Add(new GameFormField
    {
        Question = "Team Name",
        Description = "Name of the team being scouted.",
        FieldType = GameFormFieldType.Text,
        Required = true,
        DisplayOrder = 3,
        IsSystemField = true
    });
}
else if (gameForm.FormType == GameFormType.Match)
{
    gameForm.Fields.Add(new GameFormField
    {
        Question = "Scout Name",
        Description = "Name or initials of the person conducting the match scouting.",
        FieldType = GameFormFieldType.Text,
        Required = true,
        DisplayOrder = 1,
        IsSystemField = true
    });

    gameForm.Fields.Add(new GameFormField
    {
        Question = "Match Number",
        Description = "Match number being scouted.",
        FieldType = GameFormFieldType.Number,
        Required = true,
        DisplayOrder = 2,
        IsSystemField = true
    });

    gameForm.Fields.Add(new GameFormField
    {
        Question = "Team Number",
        Description = "FRC team number being scouted.",
        FieldType = GameFormFieldType.Number,
        Required = true,
        DisplayOrder = 3,
        IsSystemField = true
    });
}

    _context.GameForms.Add(gameForm);

    await _context.SaveChangesAsync();

    return CreatedAtAction(
        nameof(GetGameForm),
        new { id = gameForm.Id },
        gameForm);
}

    // PUT: api/GameForms/1
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateGameForm(
        int id,
        GameForm updatedGameForm)
    {
        var gameForm = await _context.GameForms
            .FindAsync(id);

        if (gameForm == null)
        {
            return NotFound();
        }

        var season = await _context.Seasons
            .FindAsync(updatedGameForm.SeasonId);

        if (season == null)
        {
            return BadRequest(
                "The specified season does not exist.");
        }

        gameForm.Name = updatedGameForm.Name;
        gameForm.Description = updatedGameForm.Description;
        gameForm.SeasonId = updatedGameForm.SeasonId;
        gameForm.FormType = updatedGameForm.FormType;

        await _context.SaveChangesAsync();

        return Ok(gameForm);
    }

    // POST: api/GameForms/1/fields
    [HttpPost("{gameFormId}/fields")]
    public async Task<IActionResult> CreateField(
        int gameFormId,
        GameFormField field)
    {
        var gameForm = await _context.GameForms
            .FindAsync(gameFormId);

        if (gameForm == null)
        {
            return NotFound(
                "The specified game form does not exist.");
        }

        if (field.GameFormId != gameFormId)
        {
            return BadRequest(
                "The field does not belong to the specified game form.");
        }

        // Clients cannot create system fields.
        field.IsSystemField = false;

        // Only Dropdown and MultiSelect fields can have options.
        if (field.FieldType != GameFormFieldType.Dropdown &&
            field.FieldType != GameFormFieldType.MultiSelect)
        {
            field.Options.Clear();
        }

        _context.GameFormFields.Add(field);

        await _context.SaveChangesAsync();

        return Ok(field);
    }

// PUT: api/GameForms/fields/7
[HttpPut("fields/{fieldId}")]
public async Task<IActionResult> UpdateField(
    int fieldId,
    GameFormField updatedField)
{
    var field = await _context.GameFormFields
        .Include(f => f.Options)
        .FirstOrDefaultAsync(f => f.Id == fieldId);

    if (field == null)
    {
        return NotFound();
    }

    // System fields cannot be modified.
    if (field.IsSystemField)
    {
        return BadRequest(
            "System fields cannot be modified.");
    }

    field.Question = updatedField.Question;
    field.Description = updatedField.Description;
    field.FieldType = updatedField.FieldType;
    field.Required = updatedField.Required;
    field.DisplayOrder = updatedField.DisplayOrder;

    // Only Dropdown and MultiSelect fields can have options.
    if (field.FieldType != GameFormFieldType.Dropdown &&
        field.FieldType != GameFormFieldType.MultiSelect)
    {
        _context.GameFormFieldOptions.RemoveRange(field.Options);
    }
    else
    {
        // Remove options that no longer exist in the submitted list.
        var updatedOptionIds = updatedField.Options
            .Where(o => o.Id > 0)
            .Select(o => o.Id)
            .ToHashSet();

        var optionsToRemove = field.Options
            .Where(o => !updatedOptionIds.Contains(o.Id))
            .ToList();

        _context.GameFormFieldOptions.RemoveRange(optionsToRemove);

        // Update existing options and create new options.
        foreach (var updatedOption in updatedField.Options)
        {
            if (updatedOption.Id > 0)
            {
                var existingOption = field.Options
                    .FirstOrDefault(o => o.Id == updatedOption.Id);

                if (existingOption != null)
                {
                    existingOption.Value = updatedOption.Value;
                    existingOption.DisplayOrder =
                        updatedOption.DisplayOrder;
                }
            }
            else
            {
                var newOption = new GameFormFieldOption
                {
                    GameFormFieldId = field.Id,
                    Value = updatedOption.Value,
                    DisplayOrder = updatedOption.DisplayOrder
                };

                _context.GameFormFieldOptions.Add(newOption);
            }
        }
    }

    await _context.SaveChangesAsync();

    // Return the updated field including its options.
    await _context.Entry(field)
        .Collection(f => f.Options)
        .LoadAsync();

    return Ok(field);
}    // POST: api/GameForms/fields/7/options
    [HttpPost("fields/{fieldId}/options")]
    public async Task<IActionResult> CreateFieldOption(
        int fieldId,
        GameFormFieldOption option)
    {
        var field = await _context.GameFormFields
            .FindAsync(fieldId);

        if (field == null)
        {
            return NotFound(
                "The specified field does not exist.");
        }

        if (field.FieldType != GameFormFieldType.Dropdown &&
            field.FieldType != GameFormFieldType.MultiSelect)
        {
            return BadRequest(
                "Options can only be added to Dropdown or MultiSelect fields.");
        }

        if (option.GameFormFieldId != fieldId)
        {
            return BadRequest(
                "The option does not belong to the specified field.");
        }

        _context.GameFormFieldOptions.Add(option);

        await _context.SaveChangesAsync();

        return Ok(option);
    }

    // PUT: api/GameForms/fields/options/1
    [HttpPut("fields/options/{optionId}")]
    public async Task<IActionResult> UpdateFieldOption(
        int optionId,
        GameFormFieldOption updatedOption)
    {
        var option = await _context.GameFormFieldOptions
            .Include(o => o.GameFormField)
            .FirstOrDefaultAsync(o => o.Id == optionId);

        if (option == null)
        {
            return NotFound();
        }

        if (option.GameFormField.FieldType !=
                GameFormFieldType.Dropdown &&
            option.GameFormField.FieldType !=
                GameFormFieldType.MultiSelect)
        {
            return BadRequest(
                "Options can only belong to Dropdown or MultiSelect fields.");
        }

        option.Value = updatedOption.Value;
        option.DisplayOrder = updatedOption.DisplayOrder;

        await _context.SaveChangesAsync();

        return Ok(option);
    }

    // DELETE: api/GameForms/fields/7
    [HttpDelete("fields/{fieldId}")]
    public async Task<IActionResult> DeleteField(int fieldId)
    {
        var field = await _context.GameFormFields
            .FindAsync(fieldId);

        if (field == null)
        {
            return NotFound();
        }

        // System fields cannot be deleted.
        if (field.IsSystemField)
        {
            return BadRequest(
                "System fields cannot be deleted.");
        }

        _context.GameFormFields.Remove(field);

        await _context.SaveChangesAsync();

        return NoContent();
    }

    // DELETE: api/GameForms/fields/options/1
    [HttpDelete("fields/options/{optionId}")]
    public async Task<IActionResult> DeleteFieldOption(
        int optionId)
    {
        var option = await _context.GameFormFieldOptions
            .FindAsync(optionId);

        if (option == null)
        {
            return NotFound();
        }

        _context.GameFormFieldOptions.Remove(option);

        await _context.SaveChangesAsync();

        return NoContent();
    }

    // DELETE: api/GameForms/1
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteGameForm(int id)
    {
        var gameForm = await _context.GameForms
            .FindAsync(id);

        if (gameForm == null)
        {
            return NotFound();
        }

        _context.GameForms.Remove(gameForm);

        await _context.SaveChangesAsync();

        return NoContent();
    }

  // POST: api/GameForms/restore-system-fields
[HttpPost("restore-system-fields")]
[IgnoreAntiforgeryToken]
public async Task<IActionResult> RestoreSystemFields()
{
        // PIT SCOUTING SYSTEM FIELDS

        var teamNumber = await _context.GameFormFields
            .FirstOrDefaultAsync(f => f.Id == 7);

        if (teamNumber != null)
        {
            teamNumber.Question = "Team Number";
            teamNumber.Description =
                "FRC team number being scouted.";
            teamNumber.FieldType =
                GameFormFieldType.Number;
            teamNumber.Required = true;
            teamNumber.DisplayOrder = 2;
            teamNumber.IsSystemField = true;
        }

        var teamName = await _context.GameFormFields
            .FirstOrDefaultAsync(f => f.Id == 8);

        if (teamName != null)
        {
            teamName.Question = "Team Name";
            teamName.Description =
                "Name of the team being scouted.";
            teamName.FieldType =
                GameFormFieldType.Text;
            teamName.Required = true;
            teamName.DisplayOrder = 3;
            teamName.IsSystemField = true;
        }

        var scoutName = await _context.GameFormFields
            .FirstOrDefaultAsync(f => f.Id == 10);

        if (scoutName != null)
        {
            scoutName.Question = "Scout Name";
            scoutName.Description =
                "Name or initials of the person conducting the pit scouting.";
            scoutName.FieldType =
                GameFormFieldType.Text;
            scoutName.Required = true;
            scoutName.DisplayOrder = 1;
            scoutName.IsSystemField = true;
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "System fields restored."
        });
    }

    // POST: api/GameForms/cleanup-test-fields
    [HttpPost("cleanup-test-fields")]
    public async Task<IActionResult> CleanupTestFields()
    {
        // Temporary test fields created during API testing.
        var testFieldIds = new[]
        {
            11,
            12,
            17,
            18
        };

        var testFields = await _context.GameFormFields
            .Where(f => testFieldIds.Contains(f.Id))
            .ToListAsync();

        _context.GameFormFields.RemoveRange(testFields);

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Test fields removed.",
            removed = testFields
                .Select(f => f.Id)
                .ToArray()
        });
    }
        // POST: api/GameForms/cleanup-duplicate-match-field
    [HttpPost("cleanup-duplicate-match-field")]
    public async Task<IActionResult> CleanupDuplicateMatchField()
    {
        var field = await _context.GameFormFields
            .FirstOrDefaultAsync(f => f.Id == 15);

        if (field == null)
        {
            return NotFound("Field 15 does not exist.");
        }

        if (field.GameFormId != 4)
        {
            return BadRequest(
                "Field 15 does not belong to Game Form 4.");
        }

        _context.GameFormFields.Remove(field);

        await _context.SaveChangesAsync();

        return Ok(new
        {
            message = "Duplicate Match Number field removed.",
            removedFieldId = 15
        });
    }
}
