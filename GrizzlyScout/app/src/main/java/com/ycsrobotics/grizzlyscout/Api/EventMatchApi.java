package com.ycsrobotics.grizzlyscout.Api;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public final class EventMatchApi {

    private EventMatchApi() {
    }

    public static JSONArray getEvents()
            throws Exception {

        return getJsonArray(
                "Events"
        );
    }

    public static JSONArray getMatchesForEvent(
            int eventId)
            throws Exception {

        return getJsonArray(
                "Matches/event/" +
                        eventId
        );
    }

    private static JSONArray getJsonArray(
            String endpoint)
            throws Exception {

        URL url =
                new URL(
                        ApiConfig.BASE_URL +
                                endpoint
                );

        HttpURLConnection connection =
                (HttpURLConnection)
                        url.openConnection();

        connection.setRequestMethod(
                "GET"
        );

        connection.setConnectTimeout(
                10000
        );

        connection.setReadTimeout(
                10000
        );

        int responseCode =
                connection.getResponseCode();

        InputStream stream =
                responseCode >= 200 &&
                responseCode < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();

        String response =
                readResponse(
                        stream
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

        if (trimmedResponse.startsWith(
                "["
        )) {

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

    private static String readResponse(
            InputStream stream)
            throws Exception {

        if (stream == null) {
            return "";
        }

        BufferedReader reader =
                new BufferedReader(
                        new InputStreamReader(
                                stream
                        )
                );

        StringBuilder builder =
                new StringBuilder();

        String line;

        while (
                (line = reader.readLine())
                        != null
        ) {

            builder.append(
                    line
            );
        }

        reader.close();

        return builder.toString();
    }
}