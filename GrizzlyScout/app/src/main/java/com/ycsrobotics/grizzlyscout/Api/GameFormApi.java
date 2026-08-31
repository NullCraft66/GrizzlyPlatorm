package com.ycsrobotics.grizzlyscout.Api;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class GameFormApi {

    private GameFormApi() {
    }

    public static JSONObject getGameForm(int formId)
            throws Exception {

        URL url = new URL(
                ApiConfig.BASE_URL +
                "GameForms/" +
                formId
        );

        HttpURLConnection connection =
                (HttpURLConnection) url.openConnection();

        connection.setRequestMethod("GET");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);

        int responseCode =
                connection.getResponseCode();

        InputStream stream =
                responseCode >= 200 &&
                responseCode < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

        String response =
                readResponse(stream);

        if (responseCode < 200 ||
                responseCode >= 300) {

            throw new Exception(
                    "API error " +
                    responseCode +
                    ": " +
                    response
            );
        }

        return new JSONObject(response);
    }

    public static JSONArray getGameForms()
            throws Exception {

        URL url = new URL(
                ApiConfig.BASE_URL +
                "GameForms"
        );

        HttpURLConnection connection =
                (HttpURLConnection) url.openConnection();

        connection.setRequestMethod("GET");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);

        int responseCode =
                connection.getResponseCode();

        InputStream stream =
                responseCode >= 200 &&
                responseCode < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

        String response =
                readResponse(stream);

        if (responseCode < 200 ||
                responseCode >= 300) {

            throw new Exception(
                    "API error " +
                    responseCode +
                    ": " +
                    response
            );
        }

        return new JSONArray(response);
    }

   public static JSONArray getSubmissions()
        throws Exception {

    URL url = new URL(
            ApiConfig.BASE_URL +
            "GameFormSubmissions"
    );

    HttpURLConnection connection =
            (HttpURLConnection) url.openConnection();

    connection.setRequestMethod("GET");
    connection.setConnectTimeout(10000);
    connection.setReadTimeout(10000);

    int responseCode =
            connection.getResponseCode();

    InputStream stream =
            responseCode >= 200 &&
            responseCode < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();

    String response =
            readResponse(stream);

    Log.e(
            "GrizzlyScout",
            "Submissions response: " +
                    response
    );

    if (responseCode < 200 ||
            responseCode >= 300) {

        throw new Exception(
                "API error " +
                responseCode +
                ": " +
                response
        );
    }

    String trimmedResponse =
            response.trim();

    if (trimmedResponse.startsWith("[")) {

        return new JSONArray(
                trimmedResponse
        );
    }

    JSONObject object =
            new JSONObject(
                    trimmedResponse
            );

    return object.getJSONArray(
            "value"
    );
}

public static JSONObject getSubmission(
        int submissionId)
        throws Exception {

    URL url = new URL(
            ApiConfig.BASE_URL +
            "GameFormSubmissions/" +
            submissionId
    );

    HttpURLConnection connection =
            (HttpURLConnection) url.openConnection();

    connection.setRequestMethod("GET");
    connection.setConnectTimeout(10000);
    connection.setReadTimeout(10000);

    int responseCode =
            connection.getResponseCode();

    InputStream stream =
            responseCode >= 200 &&
            responseCode < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream();

    String response =
            readResponse(stream);

    if (responseCode < 200 ||
            responseCode >= 300) {

        throw new Exception(
                "API error " +
                responseCode +
                ": " +
                response
        );
    }

    return new JSONObject(
            response
    );
}

    public static JSONObject updateSubmission(
            int submissionId,
            JSONObject submission)
            throws Exception {

        URL url = new URL(
                ApiConfig.BASE_URL +
                "GameFormSubmissions/" +
                submissionId
        );

        HttpURLConnection connection =
                (HttpURLConnection) url.openConnection();

        connection.setRequestMethod("PUT");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setDoOutput(true);

        connection.setRequestProperty(
                "Content-Type",
                "application/json"
        );

        connection.setRequestProperty(
                "Accept",
                "application/json"
        );

        byte[] body =
                submission
                        .toString()
                        .getBytes(
                                StandardCharsets.UTF_8
                        );

        try (
                OutputStream output =
                        connection.getOutputStream()
        ) {

            output.write(body);
            output.flush();
        }

        int responseCode =
                connection.getResponseCode();

        InputStream stream =
                responseCode >= 200 &&
                responseCode < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

        String response =
                readResponse(stream);

        Log.e(
                "GrizzlyScout",
                "Update submission response code: " +
                        responseCode +
                        "\nResponse: " +
                        response
        );

        if (responseCode < 200 ||
                responseCode >= 300) {

            throw new Exception(
                    "API error " +
                    responseCode +
                    ": " +
                    response
            );
        }

        return new JSONObject(
                response
        );
    }


    public static JSONObject submitSubmission(
            JSONObject submission)
            throws Exception {

        URL url = new URL(
                ApiConfig.BASE_URL +
                "GameFormSubmissions/scout"
        );

        HttpURLConnection connection =
                (HttpURLConnection) url.openConnection();

        connection.setRequestMethod("POST");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setDoOutput(true);

        connection.setRequestProperty(
                "Content-Type",
                "application/json"
        );

        connection.setRequestProperty(
                "Accept",
                "application/json"
        );

        byte[] body =
                submission
                        .toString()
                        .getBytes(
                                StandardCharsets.UTF_8
                        );

        try (
                OutputStream output =
                        connection.getOutputStream()
        ) {

            output.write(body);
            output.flush();
        }

        int responseCode =
                connection.getResponseCode();

        InputStream stream =
                responseCode >= 200 &&
                responseCode < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

        String response =
                readResponse(stream);

        Log.e(
                "GrizzlyScout",
                "Submission response code: " +
                responseCode +
                "\nResponse: " +
                response
        );

        if (responseCode < 200 ||
                responseCode >= 300) {

            throw new Exception(
                    "API error " +
                    responseCode +
                    ": " +
                    response
            );
        }

        return new JSONObject(response);
    }

    public static JSONArray getEvents()
            throws Exception {

        URL url = new URL(
                ApiConfig.BASE_URL +
                "Events"
        );

        HttpURLConnection connection =
                (HttpURLConnection) url.openConnection();

        connection.setRequestMethod("GET");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);

        int responseCode =
                connection.getResponseCode();

        InputStream stream =
                responseCode >= 200 &&
                responseCode < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

        String response =
                readResponse(stream);

        if (responseCode < 200 ||
                responseCode >= 300) {

            throw new Exception(
                    "API error " +
                    responseCode +
                    ": " +
                    response
            );
        }

       String trimmedResponse =
        response.trim();

if (trimmedResponse.startsWith("[")) {

    return new JSONArray(
            trimmedResponse
    );
}

JSONObject object =
        new JSONObject(
                trimmedResponse
        );

return object.getJSONArray(
        "value"
);
    }

    public static JSONArray getMatchesForEvent(
            int eventId)
            throws Exception {

        URL url = new URL(
                ApiConfig.BASE_URL +
                "Matches/event/" +
                eventId
        );

        HttpURLConnection connection =
                (HttpURLConnection) url.openConnection();

        connection.setRequestMethod("GET");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);

        int responseCode =
                connection.getResponseCode();

        InputStream stream =
                responseCode >= 200 &&
                responseCode < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

        String response =
                readResponse(stream);

        if (responseCode < 200 ||
                responseCode >= 300) {

            throw new Exception(
                    "API error " +
                    responseCode +
                    ": " +
                    response
            );
        }

        return new JSONArray(
                response
        );
    }

    private static String readResponse(
            InputStream stream)
            throws Exception {

        if (stream == null) {
            return "";
        }

        BufferedReader reader =
                new BufferedReader(
                        new InputStreamReader(stream)
                );

        StringBuilder builder =
                new StringBuilder();

        String line;

        while (
                (line = reader.readLine())
                        != null
        ) {

            builder.append(line);
        }

        reader.close();

        return builder.toString();
    }
}