package com.ycsrobotics.grizzlyscout.Api;

import android.content.Context;
import android.content.SharedPreferences;

public final class ApiConfig {
    private static final String PREFS = "developer_settings";
    private static final String KEY_BASE_URL = "api_base_url";
    private static final String KEY_MANUAL_OVERRIDE = "api_base_url_manual";
    private static final String DEFAULT_BASE_URL = "http://10.0.2.2:5263/api/";
    private static SharedPreferences preferences;
    private ApiConfig() { }
    public static void initialize(Context context) { preferences = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    public static String getBaseUrl() { return preferences == null ? DEFAULT_BASE_URL : preferences.getString(KEY_BASE_URL, DEFAULT_BASE_URL); }
    public static boolean hasManualOverride() { return preferences != null && preferences.getBoolean(KEY_MANUAL_OVERRIDE, false); }
    public static void setBaseUrl(String value) { if (preferences != null) preferences.edit().putString(KEY_BASE_URL, normalize(value)).putBoolean(KEY_MANUAL_OVERRIDE, true).apply(); }
    public static void clearManualOverride() { if (preferences != null) preferences.edit().putBoolean(KEY_MANUAL_OVERRIDE, false).apply(); }
    public static void setDiscoveredBaseUrl(String value) { if (preferences != null && !hasManualOverride()) preferences.edit().putString(KEY_BASE_URL, normalize(value)).apply(); }
    private static String normalize(String value) { String result = value.trim(); if (!result.endsWith("/")) result += "/"; if (!result.endsWith("api/")) result += "api/"; return result; }
}
