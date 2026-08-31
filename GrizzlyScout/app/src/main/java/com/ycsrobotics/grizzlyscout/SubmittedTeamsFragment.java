package com.ycsrobotics.grizzlyscout;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.ycsrobotics.grizzlyscout.Api.GameFormApi;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;

public class SubmittedTeamsFragment extends Fragment {

    private final ArrayList<String> teamNames =
            new ArrayList<>();

    private final ArrayList<Integer> teamNumbers =
            new ArrayList<>();

    public SubmittedTeamsFragment() {
    }

    @Override
    public View onCreateView(
            @NonNull LayoutInflater inflater,
            ViewGroup container,
            Bundle savedInstanceState) {

        return inflater.inflate(
                R.layout.fragment_submitted_teams,
                container,
                false
        );
    }

    @Override
    public void onViewCreated(
            @NonNull View view,
            @Nullable Bundle savedInstanceState) {

        super.onViewCreated(
                view,
                savedInstanceState
        );

        ListView teamsList =
                view.findViewById(
                        R.id.submittedTeamsList
                );

        TextView emptyText =
                view.findViewById(
                        R.id.emptySubmittedTeamsText
                );

        teamsList.setEmptyView(
                emptyText
        );

        ArrayAdapter<String> adapter =
                new ArrayAdapter<>(
                        requireContext(),
                        android.R.layout.simple_list_item_1,
                        teamNames
                );

        teamsList.setAdapter(
                adapter
        );

        teamsList.setOnItemClickListener(
                (parent, itemView, position, id) -> {

                    int teamNumber =
                            teamNumbers.get(
                                    position
                            );

                    SubmittedTeamFormsFragment fragment =
                            SubmittedTeamFormsFragment
                                    .newInstance(
                                            teamNumber
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
        );

        loadSubmittedTeams(
                adapter
        );
    }

    private void loadSubmittedTeams(
            ArrayAdapter<String> adapter) {

        new Thread(() -> {

            try {

                JSONArray submissions =
                        GameFormApi
                                .getSubmissions();

                LinkedHashMap<Integer, String> uniqueTeams =
                        new LinkedHashMap<>();

                for (
                        int i = 0;
                        i < submissions.length();
                        i++
                ) {

                    JSONObject submission =
                            submissions.getJSONObject(
                                    i
                            );

                    int teamNumber =
                            submission.optInt(
                                    "teamNumber",
                                    0
                            );

                    String teamName =
                            submission.optString(
                                    "teamName",
                                    ""
                            );

                    if (teamNumber > 0) {

                        uniqueTeams.put(
                                teamNumber,
                                "Team " +
                                        teamNumber +
                                        " - " +
                                        teamName
                        );
                    }
                }

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(
                                () -> {

                                    teamNames.clear();
                                    teamNumbers.clear();

                                    for (
                                            Integer teamNumber
                                            : uniqueTeams.keySet()
                                    ) {

                                        teamNumbers.add(
                                                teamNumber
                                        );

                                        teamNames.add(
                                                uniqueTeams.get(
                                                        teamNumber
                                                )
                                        );
                                    }

                                    adapter.notifyDataSetChanged();
                                }
                        );

            } catch (Exception e) {

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(
                                () ->
                                        Toast.makeText(
                                                requireContext(),
                                                "Could not load submitted teams: " +
                                                        e.getMessage(),
                                                Toast.LENGTH_LONG
                                        ).show()
                        );
            }

        }).start();
    }
}