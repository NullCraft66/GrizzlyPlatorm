package com.ycsrobotics.grizzlyscout;

import android.graphics.Color;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import androidx.fragment.app.Fragment;
import com.ycsrobotics.grizzlyscout.Api.NexusApi;
import org.json.JSONObject;

public class NexusEventFragment extends Fragment {
    private final int ink = Color.rgb(33,30,32), muted = Color.rgb(103,98,91), cream = Color.rgb(248,245,236);
    public View onCreateView(LayoutInflater i, ViewGroup c, Bundle b) {
        ScrollView scroll = new ScrollView(requireContext()); scroll.setBackgroundColor(cream);
        LinearLayout root = new LinearLayout(requireContext()); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(32,30,32,36); scroll.addView(root);
        TextView title = text("EVENT LIVE STATUS", 26, ink); root.addView(title);
        TextView status = text("Connecting…", 14, muted); root.addView(status);
        TextView data = text("Loading Nexus data…", 17, ink); data.setPadding(0,24,0,0); root.addView(data);
        new Thread(() -> { try { JSONObject s=NexusApi.getSnapshot(); requireActivity().runOnUiThread(() -> { status.setText(s.optBoolean("connected") ? "CONNECTED" : "OFFLINE"); data.setText("Event: "+s.optString("eventKey","—")+"\nLast refresh: "+s.optString("refreshedAt","—")+"\n\nNow playing\n"+summary(s.optJSONObject("status"),"nowPlaying")+"\n\nNow queuing\n"+summary(s.optJSONObject("status"),"nowQueuing")+"\n\nNext matches\n"+s.optJSONArray("matches")); }); } catch(Exception e) { requireActivity().runOnUiThread(() -> { status.setText("CONNECTION ISSUE"); data.setText(e.getMessage()); }); } }).start();
        LinearLayout pits = new LinearLayout(requireContext()); pits.setOrientation(LinearLayout.VERTICAL); root.addView(pits);
        new Thread(() -> { try { JSONObject snap=NexusApi.getSnapshot(); org.json.JSONArray list=snap.optJSONArray("pits"); requireActivity().runOnUiThread(() -> { if (list == null || list.length() == 0) { pits.addView(text("No pit map data available.", 16, muted)); return; } for (int n=0; n<list.length(); n++) { final JSONObject pit=list.optJSONObject(n); if (pit == null) continue; TextView row=text("Team "+pit.optString("teamNumber","-")+" - "+pit.optString("address",pit.optString("pitAddress","-")), 16, ink); row.setPadding(0,12,0,12); row.setOnClickListener(v -> new android.app.AlertDialog.Builder(requireContext()).setTitle("Team "+pit.optString("teamNumber","-")).setMessage(pit.toString()).setNegativeButton("Navigate", (d,w) -> { try { String address=pit.optString("address",pit.optString("pitAddress","")); startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("geo:0,0?q="+android.net.Uri.encode(address)))); } catch(Exception ignored) { } }).setPositiveButton("Close", null).show()); pits.addView(row); } }); } catch(Exception ignored) { } });
        return scroll;
    }
    private String summary(JSONObject o,String key) { return o == null ? "None" : o.optString(key,"None"); }
    private TextView text(String s,float z,int color) { TextView v=new TextView(requireContext()); v.setText(s); v.setTextSize(z); v.setTextColor(color); return v; }
}



