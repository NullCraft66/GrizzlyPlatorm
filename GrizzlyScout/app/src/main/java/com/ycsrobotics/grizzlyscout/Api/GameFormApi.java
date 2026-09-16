package com.ycsrobotics.grizzlyscout.Api;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class GameFormApi {

    private static final int TIMEOUT_MILLIS = 10_000;

    private GameFormApi() {
    }

    public static JSONObject getGameForm(int formId) throws Exception {
        return getObject("GameForms/" + formId);
    }

    public static JSONArray getGameForms() throws Exception {
        return getArray("GameForms");
    }

    public static JSONObject getActiveScoutingConfiguration() throws Exception {
        return getObject("ActiveScoutingConfiguration");
    }

    public static JSONObject getEventsObject() throws Exception {
        return getObject("Events");
    }

    public static JSONArray getEvents() throws Exception {
        return getArray("Events");
    }

    public static JSONArray getMatchesForEvent(int eventId) throws Exception {
        return getArray("Matches/event/" + eventId);
    }

    public static JSONArray getSubmissions() throws Exception {
        return getArray("GameFormSubmissions");
    }

    public static JSONObject getSubmission(int submissionId) throws Exception {
        return getObject("GameFormSubmissions/" + submissionId);
    }

    public static JSONObject updateSubmission(int submissionId, JSONObject submission)
            throws Exception {
        return sendObject("PUT", "GameFormSubmissions/" + submissionId, submission);
    }

    public static JSONObject submitSubmission(JSONObject submission) throws Exception {
        return sendObject("POST", "GameFormSubmissions/scout", submission);
    }

    public static JSONObject getAlliancePlan(int eventId) throws Exception {
        return getObject("AlliancePlans/event/" + eventId);
    }

    public static JSONObject suggestAllianceTeam(int eventId, JSONObject suggestion) throws Exception {
        return sendObject("POST", "AlliancePlans/event/" + eventId + "/suggestions", suggestion);
    }

    public static final class EventSelection {
        public final JSONArray events;
        public final boolean preset;

        private EventSelection(JSONArray events, boolean preset) {
            this.events = events;
            this.preset = preset;
        }
    }

    public static EventSelection getEventSelection(int formId) throws Exception {
        JSONObject configuration = getActiveScoutingConfiguration();
        int seasonId = getGameForm(formId).getInt("seasonId");
        int activeSeasonId = configuration.optInt("activeSeasonId", 0);
        int activeEventId = configuration.optInt("activeEventId", 0);
        if (activeSeasonId > 0 && activeSeasonId != seasonId) {
            throw new Exception("This form is not in the active season. Reopen scouting to load the current form.");
        }

        JSONArray availableEvents = getEvents();
        JSONArray matchingEvents = new JSONArray();
        for (int i = 0; i < availableEvents.length(); i++) {
            JSONObject event = availableEvents.getJSONObject(i);
            if (event.optInt("seasonId", 0) == seasonId &&
                    (activeEventId <= 0 || event.optInt("id", 0) == activeEventId)) {
                matchingEvents.put(event);
            }
        }
        if (activeEventId > 0 && matchingEvents.length() == 0) {
            throw new Exception("The active event is unavailable for this form. Check Device Configuration on the site.");
        }
        return new EventSelection(matchingEvents, activeEventId > 0);
    }

    private static JSONObject getObject(String endpoint) throws Exception {
        return new JSONObject(request("GET", endpoint, null));
    }

    private static JSONArray getArray(String endpoint) throws Exception {
        String response = request("GET", endpoint, null).trim();
        if (response.startsWith("[")) {
            return new JSONArray(response);
        }

        JSONObject object = new JSONObject(response);
        if (object.has("value")) {
            return object.getJSONArray("value");
        }
        if (object.has("Value")) {
            return object.getJSONArray("Value");
        }
        throw new Exception("API response did not contain an array.");
    }

    private static JSONObject sendObject(String method, String endpoint, JSONObject body)
            throws Exception {
        return new JSONObject(request(method, endpoint, body));
    }

    private static String request(String method, String endpoint, JSONObject body)
            throws IOException {
        URL url = new URL(ApiConfig.getBaseUrl() + endpoint);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(TIMEOUT_MILLIS);
            connection.setReadTimeout(TIMEOUT_MILLIS);

            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("Accept", "application/json");
                byte[] requestBody = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(requestBody);
                }
            }

            int responseCode = connection.getResponseCode();
            boolean successful = responseCode >= 200 && responseCode < 300;
            InputStream stream = successful
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String response = readResponse(stream);
            if (!successful) {
                throw new IOException("API error " + responseCode + ": " + response);
            }
            return response;
        } finally {
            connection.disconnect();
        }
    }

    private static String readResponse(InputStream stream) throws IOException {
        if (stream == null) {
            return "";
        }

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
            return builder.toString();
        }
    }
}
