package com.ycsrobotics.grizzlyscout;

import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.ycsrobotics.grizzlyscout.Api.GameFormApi;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;

public class SubmittedFormDetailsFragment
        extends Fragment {

    private static final String ARG_SUBMISSION_ID =
            "submissionId";

    private int submissionId;

    private LinearLayout layout;

    private JSONObject currentSubmission;

    private boolean editMode =
            false;

    private final ArrayList<Integer> fieldIds =
            new ArrayList<>();

    private final ArrayList<EditText> answerInputs =
            new ArrayList<>();

    public SubmittedFormDetailsFragment() {
    }

    public static SubmittedFormDetailsFragment newInstance(
            int submissionId) {

        SubmittedFormDetailsFragment fragment =
                new SubmittedFormDetailsFragment();

        Bundle args =
                new Bundle();

        args.putInt(
                ARG_SUBMISSION_ID,
                submissionId
        );

        fragment.setArguments(
                args
        );

        return fragment;
    }

    @Override
    public void onCreate(
            @Nullable Bundle savedInstanceState) {

        super.onCreate(
                savedInstanceState
        );

        if (getArguments() != null) {

            submissionId =
                    getArguments().getInt(
                            ARG_SUBMISSION_ID
                    );
        }
    }

    @Nullable
    @Override
    public View onCreateView(
            @NonNull LayoutInflater inflater,
            @Nullable ViewGroup container,
            @Nullable Bundle savedInstanceState) {

        ScrollView scrollView =
                new ScrollView(
                        requireContext()
                );

        layout =
                new LinearLayout(
                        requireContext()
                );

        layout.setOrientation(
                LinearLayout.VERTICAL
        );

        int padding =
                dpToPx(
                        16
                );

        layout.setPadding(
                padding,
                padding,
                padding,
                padding
        );

        scrollView.addView(
                layout
        );

        return scrollView;
    }

    @Override
    public void onViewCreated(
            @NonNull View view,
            @Nullable Bundle savedInstanceState) {

        super.onViewCreated(
                view,
                savedInstanceState
        );

        loadSubmission();
    }

    private void loadSubmission() {

        layout.removeAllViews();

        ProgressBar progressBar =
                new ProgressBar(
                        requireContext()
                );

        LinearLayout.LayoutParams progressParams =
                new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                );

        progressParams.gravity =
                Gravity.CENTER;

        layout.addView(
                progressBar,
                progressParams
        );

        new Thread(() -> {

            try {

                JSONObject submission =
                        GameFormApi.getSubmission(
                                submissionId
                        );

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() -> {

                            currentSubmission =
                                    submission;

                            editMode =
                                    false;

                            showSubmission();
                        });

            } catch (Exception e) {

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() -> {

                            layout.removeAllViews();

                            Toast.makeText(
                                    requireContext(),
                                    "Failed to load form details: " +
                                            e.getMessage(),
                                    Toast.LENGTH_LONG
                            ).show();
                        });
            }

        }).start();
    }

    private void showSubmission() {

        if (currentSubmission == null) {
            return;
        }

        layout.removeAllViews();

        fieldIds.clear();

        answerInputs.clear();

        addText(
                layout,
                currentSubmission.optString(
                        "gameFormName",
                        "Submitted Form"
                ),
                22
        );

        addText(
                layout,
                "Team: " +
                        currentSubmission.optInt(
                                "teamNumber",
                                0
                        ) +
                        " - " +
                        currentSubmission.optString(
                                "teamName",
                                ""
                        ),
                16
        );

        String matchNumber =
                currentSubmission.optString(
                        "matchNumber",
                        ""
                );

        if (!matchNumber.isEmpty() &&
                !matchNumber.equals("null")) {

            addText(
                    layout,
                    "Match: " +
                            matchNumber,
                    16
            );
        }

        addText(
                layout,
                "Submitted: " +
                        currentSubmission.optString(
                                "submittedAt",
                                ""
                        ),
                14
        );

        addText(
                layout,
                "",
                8
        );

        addText(
                layout,
                "Answers",
                20
        );

        JSONArray answers =
                currentSubmission.optJSONArray(
                        "answers"
                );

        if (answers == null ||
                answers.length() == 0) {

            addText(
                    layout,
                    "No answers found.",
                    16
            );

            return;
        }

        for (
                int i = 0;
                i < answers.length();
                i++
        ) {

            JSONObject answer =
                    answers.optJSONObject(
                            i
                    );

            if (answer == null) {
                continue;
            }

            int fieldId =
                    answer.optInt(
                            "fieldId",
                            0
                    );

            String question =
                    answer.optString(
                            "question",
                            "Unknown Question"
                    );

            String value =
                    answer.optString(
                            "value",
                            ""
                    );

            addText(
                    layout,
                    question,
                    17
            );

            if (editMode) {

                EditText input =
                        new EditText(
                                requireContext()
                        );

                input.setText(
                        value
                );

                input.setTextSize(
                        15
                );

                input.setLayoutParams(
                        new LinearLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.WRAP_CONTENT
                        )
                );

                layout.addView(
                        input
                );

                fieldIds.add(
                        fieldId
                );

                answerInputs.add(
                        input
                );

            } else {

                addText(
                        layout,
                        value,
                        15
                );
            }

            addText(
                    layout,
                    "",
                    10
            );
        }

        if (editMode) {

            addSaveButton();

            addCancelButton();

        } else {

            addEditButton();
        }
    }

    private void addEditButton() {

        Button editButton =
                new Button(
                        requireContext()
                );

        editButton.setText(
                "Edit Answers"
        );

        editButton.setOnClickListener(
                v -> {

                    editMode =
                            true;

                    showSubmission();
                }
        );

        layout.addView(
                editButton
        );
    }

    private void addSaveButton() {

        Button saveButton =
                new Button(
                        requireContext()
                );

        saveButton.setText(
                "Save Changes"
        );

        saveButton.setOnClickListener(
                v -> saveChanges()
        );

        layout.addView(
                saveButton
        );
    }

    private void addCancelButton() {

        Button cancelButton =
                new Button(
                        requireContext()
                );

        cancelButton.setText(
                "Cancel"
        );

        cancelButton.setOnClickListener(
                v -> {

                    editMode =
                            false;

                    showSubmission();
                }
        );

        layout.addView(
                cancelButton
        );
    }

    private void saveChanges() {

        try {

            JSONObject request =
                    new JSONObject();

            JSONArray answers =
                    new JSONArray();

            for (
                    int i = 0;
                    i < fieldIds.size();
                    i++
            ) {

                JSONObject answer =
                        new JSONObject();

                answer.put(
                        "gameFormFieldId",
                        fieldIds.get(
                                i
                        )
                );

                answer.put(
                        "value",
                        answerInputs.get(
                                i
                        )
                                .getText()
                                .toString()
                );

                answers.put(
                        answer
                );
            }

            request.put(
                    "answers",
                    answers
            );

            Toast.makeText(
                    requireContext(),
                    "Saving changes...",
                    Toast.LENGTH_SHORT
            ).show();

            new Thread(() -> {

                try {

                    GameFormApi.updateSubmission(
                            submissionId,
                            request
                    );

                    if (!isAdded()) {
                        return;
                    }

                    requireActivity()
                            .runOnUiThread(() -> {

                                Toast.makeText(
                                        requireContext(),
                                        "Changes saved",
                                        Toast.LENGTH_SHORT
                                ).show();

                                loadSubmission();
                            });

                } catch (Exception e) {

                    if (!isAdded()) {
                        return;
                    }

                    requireActivity()
                            .runOnUiThread(() ->

                                    Toast.makeText(
                                            requireContext(),
                                            "Failed to save changes: " +
                                                    e.getMessage(),
                                            Toast.LENGTH_LONG
                                    ).show()
                            );
                }

            }).start();

        } catch (Exception e) {

            Toast.makeText(
                    requireContext(),
                    "Could not prepare update: " +
                            e.getMessage(),
                    Toast.LENGTH_LONG
            ).show();
        }
    }

    private void addText(
            LinearLayout layout,
            String text,
            int textSize) {

        TextView textView =
                new TextView(
                        requireContext()
                );

        textView.setText(
                text
        );

        textView.setTextSize(
                textSize
        );

        textView.setPadding(
                0,
                dpToPx(4),
                0,
                dpToPx(4)
        );

        layout.addView(
                textView
        );
    }

    private int dpToPx(
            int dp) {

        float density =
                getResources()
                        .getDisplayMetrics()
                        .density;

        return (int) (
                dp * density
        );
    }
}