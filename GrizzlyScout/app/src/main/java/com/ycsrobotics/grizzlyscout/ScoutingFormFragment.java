package com.ycsrobotics.grizzlyscout;

import android.graphics.Color;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentTransaction;

import com.ycsrobotics.grizzlyscout.Api.GameFormApi;

import org.json.JSONArray;
import org.json.JSONObject;

public class ScoutingFormFragment extends Fragment {

    public static final int PIT_FORM = 0;
    public static final int MATCH_FORM = 1;

    private LinearLayout formContainer;
    private ProgressBar progressBar;
    private int selectedFormType = PIT_FORM;

    public ScoutingFormFragment() {
    }

    public static ScoutingFormFragment newInstance(int formType) {

        ScoutingFormFragment fragment =
                new ScoutingFormFragment();

        Bundle arguments =
                new Bundle();

        arguments.putInt(
                "formType",
                formType
        );

        fragment.setArguments(
                arguments
        );

        return fragment;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {

        super.onCreate(savedInstanceState);

        if (getArguments() != null) {

            selectedFormType =
                    getArguments().getInt(
                            "formType",
                            PIT_FORM
                    );
        }
    }

    @Override
    public View onCreateView(
            LayoutInflater inflater,
            ViewGroup container,
            Bundle savedInstanceState) {

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

        if (selectedFormType == PIT_FORM) {
            title.setText("Select Pit Form");
        } else {
            title.setText("Select Match Form");
        }

        title.setTextSize(26);

        title.setPadding(
                0,
                0,
                0,
                24
        );

        progressBar =
                new ProgressBar(
                        requireContext()
                );

        formContainer =
                new LinearLayout(
                        requireContext()
                );

        formContainer.setOrientation(
                LinearLayout.VERTICAL
        );

        root.addView(title);
        root.addView(progressBar);

        root.addView(
                formContainer,
                new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                )
        );

        loadForms();

        return root;
    }

    private void loadForms() {

        new Thread(() -> {

            try {

                JSONArray forms =
                        GameFormApi.getGameForms();

                if (!isAdded()) {
                    return;
                }

                requireActivity().runOnUiThread(() -> {

                    progressBar.setVisibility(
                            View.GONE
                    );

                    boolean foundForms =
                            false;

                    for (
                            int i = 0;
                            i < forms.length();
                            i++
                    ) {

                        try {

                            JSONObject form =
                                    forms.getJSONObject(i);

                            int formType =
                                    form.optInt(
                                            "formType",
                                            -1
                                    );

                            if (formType != selectedFormType) {
                                continue;
                            }

                            foundForms = true;

                            int formId =
                                    form.getInt("id");

                            String formName =
                                    form.optString(
                                            "name",
                                            "Unnamed Form"
                                    );

                            int seasonId =
                                    form.optInt(
                                            "seasonId",
                                            0
                                    );

                            Button formButton =
                                    new Button(
                                            requireContext()
                                    );

                            formButton.setText(
                                    formName +
                                    "\nSeason ID: " +
                                    seasonId
                            );

                            formButton.setTextSize(18);

                            formButton.setTextColor(
                                    Color.WHITE
                            );

                            LinearLayout.LayoutParams params =
                                    new LinearLayout.LayoutParams(
                                            ViewGroup.LayoutParams.MATCH_PARENT,
                                            ViewGroup.LayoutParams.WRAP_CONTENT
                                    );

                            params.setMargins(
                                    0,
                                    8,
                                    0,
                                    8
                            );

                            formButton.setLayoutParams(
                                    params
                            );

formButton.setOnClickListener(v -> {

    if (selectedFormType == MATCH_FORM) {

        openMatchSelection(
                formId
        );

    } else {

        openForm(
                formId
        );
    }
});

                            formContainer.addView(
                                    formButton
                            );

                        } catch (Exception e) {

                            showMessage(
                                    "Error reading form:\n" +
                                    e.getMessage()
                            );
                        }
                    }

                    if (!foundForms) {

                        if (selectedFormType == PIT_FORM) {

                            showMessage(
                                    "No pit scouting forms found."
                            );

                        } else {

                            showMessage(
                                    "No match scouting forms found."
                            );
                        }
                    }
                });

            } catch (Exception e) {

                if (!isAdded()) {
                    return;
                }

                requireActivity().runOnUiThread(() -> {

                    progressBar.setVisibility(
                            View.GONE
                    );

                    showMessage(
                            "Could not load forms:\n" +
                            e.getMessage()
                    );
                });
            }

        }).start();
    }

private void openMatchSelection(
        int formId) {

    Bundle arguments =
            new Bundle();

    arguments.putInt(
            "formId",
            formId
    );

    MatchSelectionFragment fragment =
            new MatchSelectionFragment();

    fragment.setArguments(
            arguments
    );

    requireActivity()
            .getSupportFragmentManager()
            .beginTransaction()
            .setCustomAnimations(
                    android.R.animator.fade_in,
                    android.R.animator.fade_out
            )
            .replace(
                    R.id.contentFragment,
                    fragment
            )
            .addToBackStack(
                    null
            )
            .commit();
}

    private void openForm(int formId) {

        Bundle arguments =
                new Bundle();

        arguments.putInt(
                "formId",
                formId
        );

        DynamicScoutingFormFragment fragment =
                new DynamicScoutingFormFragment();

        fragment.setArguments(
                arguments
        );

        FragmentManager manager =
                requireActivity()
                        .getSupportFragmentManager();

        FragmentTransaction transaction =
                manager.beginTransaction();

        transaction.setCustomAnimations(
                android.R.animator.fade_in,
                android.R.animator.fade_out
        );

        transaction.replace(
                R.id.contentFragment,
                fragment
        );

        transaction.addToBackStack(
                null
        );

        transaction.commit();
    }

    private void showMessage(
            String message) {

        TextView messageView =
                new TextView(
                        requireContext()
                );

        messageView.setText(
                message
        );

        messageView.setTextSize(
                18
        );

        messageView.setPadding(
                16,
                24,
                16,
                24
        );

        formContainer.addView(
                messageView
        );
    }
}