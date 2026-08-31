package com.ycsrobotics.grizzlyscout;

import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.fragment.app.Fragment;

import com.ycsrobotics.grizzlyscout.Api.GameFormApi;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MatchSelectionFragment extends Fragment {

    private int formId;

    private Spinner eventSpinner;
    private Spinner matchSpinner;

    private ProgressBar progressBar;
    private Button continueButton;

    private final List<JSONObject> events =
            new ArrayList<>();

    private final List<JSONObject> matches =
            new ArrayList<>();

    public MatchSelectionFragment() {
    }

    @Override
    public View onCreateView(
            LayoutInflater inflater,
            ViewGroup container,
            Bundle savedInstanceState) {

        formId =
                getArguments() != null
                        ? getArguments().getInt(
                                "formId",
                                0
                        )
                        : 0;

        LinearLayout root =
                new LinearLayout(
                        requireContext()
                );

        root.setOrientation(
                LinearLayout.VERTICAL
        );

        root.setPadding(
                32,
                32,
                32,
                32
        );

        TextView title =
                new TextView(
                        requireContext()
                );

        title.setText(
                "Select Match"
        );

        title.setTextSize(
                26
        );

        title.setPadding(
                0,
                0,
                0,
                32
        );

        TextView eventLabel =
                new TextView(
                        requireContext()
                );

        eventLabel.setText(
                "Event"
        );

        eventLabel.setTextSize(
                18
        );

        eventSpinner =
                new Spinner(
                        requireContext()
                );

        TextView matchLabel =
                new TextView(
                        requireContext()
                );

        matchLabel.setText(
                "Match"
        );

        matchLabel.setTextSize(
                18
        );

        matchLabel.setPadding(
                0,
                32,
                0,
                8
        );

        matchSpinner =
                new Spinner(
                        requireContext()
                );

        progressBar =
                new ProgressBar(
                        requireContext()
                );

        progressBar.setIndeterminate(
                true
        );

        continueButton =
                new Button(
                        requireContext()
                );

        continueButton.setText(
                "Continue to Scouting"
        );

        continueButton.setEnabled(
                false
        );

        LinearLayout.LayoutParams buttonParams =
                new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                );

        buttonParams.setMargins(
                0,
                32,
                0,
                0
        );

        continueButton.setLayoutParams(
                buttonParams
        );

        root.addView(
                title
        );

        root.addView(
                eventLabel
        );

        root.addView(
                eventSpinner
        );

        root.addView(
                matchLabel
        );

        root.addView(
                matchSpinner
        );

        root.addView(
                progressBar
        );

        root.addView(
                continueButton
        );

        eventSpinner.setOnItemSelectedListener(
                new android.widget.AdapterView
                        .OnItemSelectedListener() {

                    @Override
                    public void onItemSelected(
                            android.widget.AdapterView<?> parent,
                            View view,
                            int position,
                            long id) {

                        if (position < 0 ||
                                position >= events.size()) {

                            return;
                        }

                        JSONObject event =
                                events.get(
                                        position
                                );

                        int eventId =
                                event.optInt(
                                        "id",
                                        0
                                );

                        loadMatches(
                                eventId
                        );
                    }

                    @Override
                    public void onNothingSelected(
                            android.widget.AdapterView<?> parent) {
                    }
                }
        );

        continueButton.setOnClickListener(v -> {

            int eventPosition =
                    eventSpinner
                            .getSelectedItemPosition();

            int matchPosition =
                    matchSpinner
                            .getSelectedItemPosition();

            if (eventPosition < 0 ||
                    eventPosition >= events.size()) {

                showToast(
                        "Please select an event."
                );

                return;
            }

            if (matchPosition < 0 ||
                    matchPosition >= matches.size()) {

                showToast(
                        "Please select a match."
                );

                return;
            }

            openScoutingForm(
                    events.get(
                            eventPosition
                    ),
                    matches.get(
                            matchPosition
                    )
            );
        });

        loadEvents();

        return root;
    }

    private void loadEvents() {

        progressBar.setVisibility(
                View.VISIBLE
        );

        new Thread(() -> {

            try {

                JSONArray response =
                        GameFormApi.getEvents();

                JSONObject wrapper =
                        new JSONObject(
                                response.toString()
                        );

            } catch (Exception ignored) {
            }

        }).start();

        loadEventsCorrectly();
    }

    private void loadEventsCorrectly() {

        new Thread(() -> {

            try {

                JSONObject response =
                        GameFormApi.getEventsObject();

                JSONArray values =
                        response.optJSONArray(
                                "value"
                        );

                if (values == null) {

                    throw new Exception(
                            "No events returned."
                    );
                }

                events.clear();

                List<String> eventNames =
                        new ArrayList<>();

                for (
                        int i = 0;
                        i < values.length();
                        i++
                ) {

                    JSONObject event =
                            values.getJSONObject(
                                    i
                            );

                    events.add(
                            event
                    );

                    String name =
                            event.optString(
                                    "name",
                                    "Unnamed Event"
                            );

                    String location =
                            event.optString(
                                    "location",
                                    ""
                            );

                    if (!location.isEmpty()) {

                        name =
                                name +
                                " - " +
                                location;
                    }

                    eventNames.add(
                            name
                    );
                }

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() -> {

                            ArrayAdapter<String>
                                    adapter =
                                    new ArrayAdapter<>(
                                            requireContext(),
                                            android.R.layout
                                                    .simple_spinner_item,
                                            eventNames
                                    );

                            adapter
                                    .setDropDownViewResource(
                                            android.R.layout
                                                    .simple_spinner_dropdown_item
                                    );

                            eventSpinner.setAdapter(
                                    adapter
                            );

                            progressBar.setVisibility(
                                    View.GONE
                            );
                        });

            } catch (Exception e) {

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() -> {

                            progressBar.setVisibility(
                                    View.GONE
                            );

                            showToast(
                                    "Could not load events: " +
                                    e.getMessage()
                            );
                        });
            }

        }).start();
    }

    private void loadMatches(
            int eventId) {

        continueButton.setEnabled(
                false
        );

        progressBar.setVisibility(
                View.VISIBLE
        );

        new Thread(() -> {

            try {

                JSONArray response =
                        GameFormApi.getMatchesForEvent(
                                eventId
                        );

                matches.clear();

                List<String> matchNames =
                        new ArrayList<>();

                for (
                        int i = 0;
                        i < response.length();
                        i++
                ) {

                    JSONObject match =
                            response.getJSONObject(
                                    i
                            );

                    matches.add(
                            match
                    );

                    String matchType =
                            match.optString(
                                    "matchType",
                                    "Match"
                            );

                    int matchNumber =
                            match.optInt(
                                    "matchNumber",
                                    0
                            );

                    int setNumber =
                            match.optInt(
                                    "setNumber",
                                    0
                            );

                    String display =
                            matchType +
                            " " +
                            matchNumber;

                    if (setNumber > 0) {

                        display =
                                display +
                                " - Set " +
                                setNumber;
                    }

                    matchNames.add(
                            display
                    );
                }

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() -> {

                            ArrayAdapter<String>
                                    adapter =
                                    new ArrayAdapter<>(
                                            requireContext(),
                                            android.R.layout
                                                    .simple_spinner_item,
                                            matchNames
                                    );

                            adapter
                                    .setDropDownViewResource(
                                            android.R.layout
                                                    .simple_spinner_dropdown_item
                                    );

                            matchSpinner.setAdapter(
                                    adapter
                            );

                            progressBar.setVisibility(
                                    View.GONE
                            );

                            continueButton.setEnabled(
                                    !matches.isEmpty()
                            );
                        });

            } catch (Exception e) {

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() -> {

                            progressBar.setVisibility(
                                    View.GONE
                            );

                            showToast(
                                    "Could not load matches: " +
                                    e.getMessage()
                            );
                        });
            }

        }).start();
    }

    private void openScoutingForm(
            JSONObject event,
            JSONObject match) {

        Bundle arguments =
                new Bundle();

        arguments.putInt(
                "formId",
                formId
        );

        arguments.putInt(
                "eventId",
                event.optInt(
                        "id",
                        0
                )
        );

        arguments.putInt(
                "matchId",
                match.optInt(
                        "id",
                        0
                )
        );

        arguments.putInt(
                "matchNumber",
                match.optInt(
                        "matchNumber",
                        0
                )
        );

        arguments.putInt(
                "setNumber",
                match.optInt(
                        "setNumber",
                        0
                )
        );

        arguments.putString(
                "matchType",
                match.optString(
                        "matchType",
                        ""
                )
        );

        DynamicScoutingFormFragment fragment =
                new DynamicScoutingFormFragment();

        fragment.setArguments(
                arguments
        );

        requireActivity()
                .getSupportFragmentManager()
                .beginTransaction()
                .replace(
                        R.id.contentFragment,
                        fragment
                )
                .addToBackStack(
                        null
                )
                .commit();
    }

    private void showToast(
            String message) {

        Toast.makeText(
                requireContext(),
                message,
                Toast.LENGTH_LONG
        ).show();
    }
}