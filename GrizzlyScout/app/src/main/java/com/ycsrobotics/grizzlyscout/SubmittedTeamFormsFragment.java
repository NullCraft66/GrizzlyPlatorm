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

public class SubmittedTeamFormsFragment
        extends Fragment {

    private static final String ARG_TEAM_NUMBER =
            "teamNumber";

    private int teamNumber;

    public SubmittedTeamFormsFragment() {
    }

    public static SubmittedTeamFormsFragment newInstance(
            int teamNumber) {

        SubmittedTeamFormsFragment fragment =
                new SubmittedTeamFormsFragment();

        Bundle args =
                new Bundle();

        args.putInt(
                ARG_TEAM_NUMBER,
                teamNumber
        );

        fragment.setArguments(args);

        return fragment;
    }

    @Override
    public void onCreate(
            @Nullable Bundle savedInstanceState) {

        super.onCreate(
                savedInstanceState
        );

        if (getArguments() != null) {

            teamNumber =
                    getArguments().getInt(
                            ARG_TEAM_NUMBER
                    );
        }
    }

    @Nullable
    @Override
    public View onCreateView(
            @NonNull LayoutInflater inflater,
            @Nullable ViewGroup container,
            @Nullable Bundle savedInstanceState) {

        return inflater.inflate(
                R.layout.fragment_submitted_team_forms,
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

        TextView title =
                view.findViewById(
                        R.id.submittedTeamFormsTitle
                );

        ListView list =
                view.findViewById(
                        R.id.submittedTeamFormsList
                );

        TextView emptyText =
                view.findViewById(
                        R.id.emptySubmittedTeamFormsText
                );

        title.setText(
                "Team " +
                teamNumber +
                " Submitted Forms"
        );

        loadForms(
                list,
                emptyText
        );
    }

    private void loadForms(
            ListView list,
            TextView emptyText) {

        new Thread(() -> {

            try {

                JSONArray submissions =
                        GameFormApi.getSubmissions();

                ArrayList<String> formNames =
                        new ArrayList<>();

                ArrayList<Integer> submissionIds =
                        new ArrayList<>();

                for (
                        int i = 0;
                        i < submissions.length();
                        i++
                ) {

                    JSONObject submission =
                            submissions.getJSONObject(
                                    i
                            );

                    int submittedTeamNumber =
                            submission.optInt(
                                    "teamNumber"
                            );

                    if (
                            submittedTeamNumber !=
                                    teamNumber
                    ) {

                        continue;
                    }

                    int submissionId =
                            submission.optInt(
                                    "id",
                                    -1
                            );

                    if (submissionId <= 0) {
                        continue;
                    }

                    String formName =
                            submission.optString(
                                    "gameFormName",
                                    "Unknown Form"
                            );

                    String formType =
                            submission.optString(
                                    "formType",
                                    ""
                            );

                    String submittedAt =
                            submission.optString(
                                    "submittedAt",
                                    ""
                            );

                    String displayText =
                            formName;

                    if (
                            !formType.isEmpty()
                    ) {

                        displayText +=
                                "\nType: " +
                                formType;
                    }

                    if (
                            !submittedAt.isEmpty()
                    ) {

                        displayText +=
                                "\nSubmitted: " +
                                submittedAt;
                    }

                    formNames.add(
                            displayText
                    );

                    submissionIds.add(
                            submissionId
                    );
                }

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() -> {

                            if (
                                    formNames.isEmpty()
                            ) {

                                emptyText.setVisibility(
                                        View.VISIBLE
                                );

                                list.setVisibility(
                                        View.GONE
                                );

                                return;
                            }

                            emptyText.setVisibility(
                                    View.GONE
                            );

                            list.setVisibility(
                                    View.VISIBLE
                            );

                            ArrayAdapter<String> adapter =
                                    new ArrayAdapter<>(
                                            requireContext(),
                                            android.R.layout
                                                    .simple_list_item_1,
                                            formNames
                                    );

                            list.setAdapter(
                                    adapter
                            );

                            list.setOnItemClickListener(
                                    (
                                            parent,
                                            itemView,
                                            position,
                                            id
                                    ) -> {

                                        int submissionId =
                                                submissionIds.get(
                                                        position
                                                );

                                        SubmittedFormDetailsFragment
                                                fragment =
                                                SubmittedFormDetailsFragment
                                                        .newInstance(
                                                                submissionId
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
                        });

            } catch (Exception e) {

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() ->

                                Toast.makeText(
                                        requireContext(),
                                        "Failed to load submitted forms: " +
                                                e.getMessage(),
                                        Toast.LENGTH_LONG
                                ).show()
                        );
            }

        }).start();
    }
}