using System.Globalization;
using System.Text.Json;
namespace GrizzlyPlatform.Web.Services;

public static class ScoutingAnswerFilter
{
    public static bool Matches(int fieldType, string? answer, string filter)
    {
        if (string.IsNullOrWhiteSpace(filter)) return true;
        if (string.IsNullOrWhiteSpace(answer)) return false;
        answer = answer.Trim();
        filter = filter.Trim();
        if (fieldType == 1)
            return decimal.TryParse(answer, NumberStyles.Float, CultureInfo.InvariantCulture, out var actual)
                && decimal.TryParse(filter, NumberStyles.Float, CultureInfo.InvariantCulture, out var minimum)
                && actual >= minimum;
        if (fieldType is 2 or 4)
            return BooleanValue(answer) is bool value && BooleanValue(filter) == value;
        if (fieldType == 5)
        {
            try
            {
                var values = JsonSerializer.Deserialize<List<string>>(answer);
                return values?.Any(v => string.Equals(v?.Trim(), filter,
                    StringComparison.OrdinalIgnoreCase)) == true;
            }
            catch (JsonException) { /* Older forms stored one selected value as text. */ }
        }
        return string.Equals(answer, filter, StringComparison.OrdinalIgnoreCase);
    }

    private static bool? BooleanValue(string value) => value.ToLowerInvariant() switch
    {
        "true" or "yes" or "1" or "checked" => true,
        "false" or "no" or "0" or "unchecked" => false,
        _ => null
    };
}