package com.ycsrobotics.grizzlyscout;

import android.graphics.Color;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import androidx.fragment.app.Fragment;
import com.ycsrobotics.grizzlyscout.Api.GameFormApi;
import org.json.*;

public class CurrentEventFragment extends Fragment {
    public View onCreateView(LayoutInflater i, ViewGroup c, Bundle b) {
        LinearLayout box=new LinearLayout(requireContext()); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(32,28,32,28); box.setBackgroundColor(Color.rgb(248,245,236));
        TextView title=new TextView(requireContext()); title.setText("Current Event"); title.setTextSize(32); title.setTextColor(Color.rgb(33,30,32)); title.setPadding(0,0,0,24); box.addView(title);
        TextView details=new TextView(requireContext()); details.setTextSize(18); details.setTextColor(Color.rgb(33,30,32)); details.setText("Loading active event..."); box.addView(details);
        new Thread(() -> { try { int id=GameFormApi.getActiveScoutingConfiguration().optInt("activeEventId",0); JSONArray events=GameFormApi.getEvents(); JSONObject found=null; for(int n=0;n<events.length();n++) if(events.getJSONObject(n).optInt("id",0)==id) found=events.getJSONObject(n); final JSONObject e=found; requireActivity().runOnUiThread(() -> { if(e==null){details.setText("No active event has been selected on the desktop app.");} else {details.setText("Name\n"+e.optString("name","Unnamed Event")+"\n\nLocation\n"+e.optString("location","Not specified")+"\n\nDates\n"+e.optString("startDate","TBD")+" – "+e.optString("endDate","TBD")+"\n\nEvent type\n"+e.optString("eventType","Not specified"));} }); } catch(Exception ex){ requireActivity().runOnUiThread(() -> details.setText("Could not load active event.\n"+ex.getMessage())); } }).start();
        return box;
    }
}