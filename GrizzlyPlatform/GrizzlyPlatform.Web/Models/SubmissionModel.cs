using System;
using System.Collections.Generic;

namespace GrizzlyPlatform.Web.Models;

public class SubmissionModel
{
    public int Id { get; set; }

    public int GameFormId { get; set; }

    public int TeamNumber { get; set; }

    public string ScoutName { get; set; } = "";

    public DateTime CreatedAt { get; set; }

    public int? EventId { get; set; }

    public string? MatchType { get; set; }

    public int? MatchNumber { get; set; }

    public int? SetNumber { get; set; }

    public List<SubmissionAnswerModel> Answers { get; set; }
        = new();
}

public class SubmissionAnswerModel
{
    public int Id { get; set; }

    public int GameFormFieldId { get; set; }

    public string Value { get; set; } = "";
}