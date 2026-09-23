package com.ycsrobotics.grizzlyscout;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import androidx.fragment.app.Fragment;
import com.ycsrobotics.grizzlyscout.Api.NexusApi;
import com.ycsrobotics.grizzlyscout.Api.GameFormApi;
import org.json.*;
import java.util.*;

public class PitMapFragment extends Fragment {
    private final int bg=Color.rgb(248,245,236), ink=Color.rgb(33,30,32), muted=Color.rgb(103,98,91);
    public View onCreateView(LayoutInflater i, ViewGroup c, Bundle b) {
        ScrollView scroll=new ScrollView(requireContext()); scroll.setBackgroundColor(bg); LinearLayout root=new LinearLayout(requireContext()); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(24,24,24,32); scroll.addView(root);
        TextView title=text("PIT MAP",28,ink); root.addView(title); root.addView(text("Green = our pit, gold = scouted, gray = not scouted.",14,muted));
        LinearLayout map=new LinearLayout(requireContext()); map.setOrientation(LinearLayout.VERTICAL); root.addView(map);
        new Thread(() -> { try { JSONObject snap=NexusApi.getSnapshot(); Set<String> scouted=new HashSet<>(); try { JSONArray forms=GameFormApi.getSubmissions(); for(int n=0;n<forms.length();n++) { JSONObject f=forms.optJSONObject(n); if(f!=null) scouted.add(f.optString("teamNumber", "")); } } catch(Exception ignored) {} final Set<String> done=scouted; requireActivity().runOnUiThread(() -> render(map,snap,done)); } catch(Exception e) { requireActivity().runOnUiThread(() -> map.addView(text("Could not load pit map: "+e.getMessage(),16,Color.rgb(177,72,55)))); } }).start();
        return scroll;
    }
    private void render(LinearLayout map, JSONObject snap, Set<String> scouted) { JSONObject addresses=snap.optJSONObject("pits"); JSONObject geometry=snap.optJSONObject("map"); JSONObject pits=geometry==null?null:geometry.optJSONObject("pits"); if(pits==null){map.addView(text("No live pit map is available for this event.",16,muted));return;} ArrayList<String> keys=new ArrayList<>(); Iterator<String> it=pits.keys(); while(it.hasNext())keys.add(it.next()); Collections.sort(keys); for(String key:keys){ JSONObject pit=pits.optJSONObject(key); String team=addresses==null?"":addresses.optString(key,""); String label=team.isEmpty()?key:key+"  -  team "+team; TextView row=text(label,16,ink); row.setPadding(18,16,18,16); row.setBackground(round(scouted.contains(team)?Color.rgb(242,194,77):Color.WHITE,12,Color.LTGRAY)); map.addView(row); } }
    private TextView text(String s,float z,int color){TextView v=new TextView(requireContext());v.setText(s);v.setTextSize(z);v.setTextColor(color);return v;}
    private GradientDrawable round(int c,int r,int stroke){GradientDrawable d=new GradientDrawable();d.setColor(c);d.setCornerRadius(r);d.setStroke(1,stroke);return d;}
}
