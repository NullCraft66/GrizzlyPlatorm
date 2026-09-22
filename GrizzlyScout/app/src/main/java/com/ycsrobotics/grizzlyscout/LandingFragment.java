package com.ycsrobotics.grizzlyscout;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.fragment.app.Fragment;
import com.ycsrobotics.grizzlyscout.Api.GameFormApi;
import org.json.JSONArray;
import org.json.JSONObject;

public class LandingFragment extends Fragment {
    @Override public View onCreateView(android.view.LayoutInflater inflater, android.view.ViewGroup container, Bundle state) {
        LinearLayout root = new LinearLayout(requireContext()); root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER); root.setPadding(32,32,32,32); root.setBackgroundColor(Color.rgb(205,182,90));
        ImageView logo = new ImageView(requireContext()); logo.setImageResource(R.drawable.grizzly_icon); logo.setContentDescription("Grizzly Robotics logo"); root.addView(logo, new LinearLayout.LayoutParams(-1,220));
        TextView title = new TextView(requireContext()); title.setText("GRIZZLY SCOUT"); title.setTextSize(28); title.setGravity(Gravity.CENTER); root.addView(title);
        TextView active = new TextView(requireContext()); active.setText("Loading active season and event..."); active.setTextSize(18); active.setGravity(Gravity.CENTER); active.setPadding(0,24,0,24); root.addView(active);
        Button begin = new Button(requireContext()); begin.setText("BEGIN"); begin.setOnClickListener(v -> ((MainActivity) requireActivity()).showFragment(new HomePageFragment())); root.addView(begin, new LinearLayout.LayoutParams(-1,64));
        new Thread(() -> { try { JSONObject config=GameFormApi.getActiveScoutingConfiguration(); int seasonId=config.optInt("activeSeasonId",0), eventId=config.optInt("activeEventId",0); JSONArray seasons=GameFormApi.getSeasons(); JSONArray events=GameFormApi.getEvents(); String season="No active season", event="No active event"; for(int i=0;i<seasons.length();i++){JSONObject s=seasons.getJSONObject(i); if(s.optInt("id")==seasonId) season=s.optString("year","")+" - "+s.optString("name","");} for(int i=0;i<events.length();i++){JSONObject e=events.getJSONObject(i); if(e.optInt("id")==eventId) event=e.optString("name","");} String text="Active season: "+season+"\nActive event: "+event; requireActivity().runOnUiThread(() -> active.setText(text)); } catch(Exception e){ requireActivity().runOnUiThread(() -> active.setText("Could not load active device configuration.")); } }).start(); return root;
    }
}