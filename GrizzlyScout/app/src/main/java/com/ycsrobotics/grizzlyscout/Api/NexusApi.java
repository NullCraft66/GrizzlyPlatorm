package com.ycsrobotics.grizzlyscout.Api;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public final class NexusApi {
    private NexusApi() { }
    public static JSONObject getSnapshot() throws Exception {
        URL url = new URL(ApiConfig.getBaseUrl() + "nexus/snapshot");
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setRequestMethod("GET"); c.setConnectTimeout(10000); c.setReadTimeout(10000);
        if (c.getResponseCode() < 200 || c.getResponseCode() >= 300) throw new Exception("Server error " + c.getResponseCode());
        BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()));
        StringBuilder b = new StringBuilder(); String line; while ((line = r.readLine()) != null) b.append(line);
        c.disconnect(); return new JSONObject(b.toString());
    }
}
