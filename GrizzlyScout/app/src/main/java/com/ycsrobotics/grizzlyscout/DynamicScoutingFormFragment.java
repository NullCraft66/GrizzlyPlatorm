package com.ycsrobotics.grizzlyscout;

import android.os.Bundle;
import android.widget.Button;
import android.text.InputType;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.fragment.app.Fragment;

import com.ycsrobotics.grizzlyscout.Api.GameFormApi;

import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

public class DynamicScoutingFormFragment extends Fragment {

    private LinearLayout formContainer;
    private ProgressBar progressBar;
    private int formId;
private int eventId = 0;

private int submissionId = 0;

private JSONObject existingSubmission;


private JSONObject currentForm;

private int teamNumberFieldId = 0;

private int matchNumberFieldId = 0;

private int scoutNameFieldId = 0;

private String currentFormType = "";

private boolean editMode = false;

    // Stores each answer input using the Platform field ID.
    private final Map<Integer, View> answerViews =
            new LinkedHashMap<>();

    private Button submitButton;

    public DynamicScoutingFormFragment() {
    }

    @Override
    public View onCreateView(
            LayoutInflater inflater,
            ViewGroup container,
            Bundle savedInstanceState) {

        formId = getArguments() != null
                ? getArguments().getInt("formId", 0)
                : 0;

                submissionId = getArguments() != null
        ? getArguments().getInt(
                "submissionId",
                0
        )
        : 0;

editMode =
        submissionId > 0;

        ScrollView scrollView =
                new ScrollView(requireContext());

        LinearLayout root =
                new LinearLayout(requireContext());

        root.setOrientation(
                LinearLayout.VERTICAL
        );

        root.setPadding(
                32,
                32,
                32,
                32
        );

        scrollView.addView(root);

        TextView title =
                new TextView(requireContext());

        title.setText("Scouting Form");

        title.setTextSize(26);

        title.setGravity(
                Gravity.CENTER
        );

        title.setPadding(
                0,
                0,
                0,
                24
        );

        progressBar =
                new ProgressBar(requireContext());

        formContainer =
                new LinearLayout(requireContext());

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

        if (formId <= 0) {

            showMessage(
                    "No form was selected."
            );

            progressBar.setVisibility(
                    View.GONE
            );

            return scrollView;
        }

                 if (editMode) {

            loadSubmissionForEdit();

        } else {

            loadForm();
        }

        return scrollView;
    }


private void loadSubmissionForEdit() {

    new Thread(() -> {

        try {

            existingSubmission =
                    GameFormApi.getSubmission(
                            submissionId
                    );

            formId =
                    existingSubmission.optInt(
                            "gameFormId",
                            formId
                    );

            JSONObject form =
                    GameFormApi.getGameForm(
                            formId
                    );

            if (!isAdded()) {
                return;
            }

            requireActivity()
                    .runOnUiThread(() -> {

                        progressBar.setVisibility(
                                View.GONE
                        );

                        buildForm(
                                form
                        );

                        fillExistingAnswers();
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

                        showMessage(
                                "Could not load submission:\n" +
                                e.getMessage()
                        );
                    });
        }

    }).start();
}

    private void loadForm() {

        new Thread(() -> {

            try {

                JSONObject form =
                        GameFormApi.getGameForm(
                                formId
                        );

                if (!isAdded()) {
                    return;
                }

                requireActivity().runOnUiThread(() -> {

                    progressBar.setVisibility(
                            View.GONE
                    );

                                     buildForm(
                            form
                    );
                });

            } catch (Exception e) {

                Log.e(
                        "GrizzlyScout",
                        "Could not load form",
                        e
                );

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(() -> {

                            progressBar.setVisibility(
                                    View.GONE
                            );

                            showMessage(
                                    "Could not load form:\n" +
                                    e.getMessage()
                            );
                        });
            }

        }).start();
    }

    private void buildForm(
            JSONObject form) {

        try {

currentForm = form;

currentFormType =
        form.optString(
                "formType",
                ""
        );

teamNumberFieldId = 0;
matchNumberFieldId = 0;
scoutNameFieldId = 0;

JSONArray systemFields =
        form.optJSONArray(
                "fields"
        );

if (systemFields != null) {

    for (
            int i = 0;
            i < systemFields.length();
            i++
    ) {

        JSONObject field =
                systemFields.optJSONObject(
                        i
                );

        if (field == null) {
            continue;
        }

        int fieldId =
                field.optInt(
                        "id",
                        0
                );

        String question =
                field.optString(
                        "question",
                        ""
                ).trim();

        if (question.equalsIgnoreCase(
                "Team Number"
        )) {

            teamNumberFieldId =
                    fieldId;

        } else if (question.equalsIgnoreCase(
                "Match Number"
        )) {

            matchNumberFieldId =
                    fieldId;

        } else if (question.equalsIgnoreCase(
                "Scout Name"
        )) {

            scoutNameFieldId =
                    fieldId;
        }
    }
}

            String formName =
                    form.optString(
                            "name",
                            "Scouting Form"
                    );

            TextView nameView =
                    new TextView(requireContext());

            nameView.setText(
                    formName
            );

            nameView.setTextSize(
                    24
            );

            nameView.setPadding(
                    0,
                    0,
                    0,
                    24
            );

            formContainer.addView(
                    nameView
            );

            JSONArray fields =
                    form.optJSONArray(
                            "fields"
                    );

            if (fields == null ||
                    fields.length() == 0) {

                showMessage(
                        "This form has no questions yet."
                );

                return;
            }

            for (
                    int i = 0;
                    i < fields.length();
                    i++
            ) {

                JSONObject field =
                        fields.getJSONObject(i);

                createField(
                        field
                );
            }

            submitButton =
                    new Button(requireContext());

submitButton.setText(
        editMode
                ? "Save Changes"
                : "Submit Form"
);

            LinearLayout.LayoutParams submitParams =
                    new LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT
                    );

            submitParams.setMargins(
                    0,
                    32,
                    0,
                    32
            );

            submitButton.setLayoutParams(
                    submitParams
            );

            submitButton.setOnClickListener(
                    v -> submitForm()
            );

            formContainer.addView(
                    submitButton
            );

        } catch (Exception e) {

            showMessage(
                    "Error building form:\n" +
                    e.getMessage()
            );
        }
    }

    private void createField(
            JSONObject field) {

        try {

            int fieldId =
                    field.optInt(
                            "id",
                            0
                    );

            String label =
                    field.optString(
                            "question",
                            field.optString(
                                    "label",
                                    "Unnamed Question"
                            )
                    );

            int fieldType =
                    field.optInt(
                            "fieldType",
                            0
                    );

            TextView labelView =
                    new TextView(requireContext());

            labelView.setText(
                    label
            );

            labelView.setTextSize(
                    18
            );

            labelView.setPadding(
                    0,
                    24,
                    0,
                    8
            );

            formContainer.addView(
                    labelView
            );

            switch (fieldType) {

                case 0:
                    createTextInput(fieldId);
                    break;

                case 1:
                    createNumberInput(fieldId);
                    break;

                case 2:
                    createYesNoInput(fieldId);
                    break;

                case 3:
                    createDropdownInput(
                            fieldId,
                            field
                    );
                    break;

                case 4:
                    createCheckboxInput(fieldId);
                    break;

                case 5:
                    createMultiSelectInput(
                            fieldId,
                            field
                    );
                    break;

                default:
                    showMessage(
                            "Unsupported field type: " +
                            fieldType
                    );
                    break;
            }

        } catch (Exception e) {

            showMessage(
                    "Error creating question:\n" +
                    e.getMessage()
            );
        }
    }

    private void createTextInput(
            int fieldId) {

        EditText input =
                new EditText(requireContext());

        input.setSingleLine(
                false
        );

        input.setHint(
                "Enter response"
        );

        answerViews.put(
                fieldId,
                input
        );

        formContainer.addView(
                input
        );
    }

    private void createNumberInput(
            int fieldId) {

        EditText input =
                new EditText(requireContext());

        input.setInputType(
                InputType.TYPE_CLASS_NUMBER |
                InputType.TYPE_NUMBER_FLAG_DECIMAL
        );

        input.setHint(
                "Enter number"
        );

        answerViews.put(
                fieldId,
                input
        );

        formContainer.addView(
                input
        );
    }

    private void createYesNoInput(
            int fieldId) {

        RadioGroup group =
                new RadioGroup(requireContext());

        group.setOrientation(
                RadioGroup.HORIZONTAL
        );

        RadioButton yes =
                new RadioButton(requireContext());

        yes.setText(
                "Yes"
        );

        RadioButton no =
                new RadioButton(requireContext());

        no.setText(
                "No"
        );

        group.addView(yes);

        group.addView(no);

        answerViews.put(
                fieldId,
                group
        );

        formContainer.addView(
                group
        );
    }

    private void createDropdownInput(
            int fieldId,
            JSONObject field) {

        try {

            JSONArray options =
                    field.optJSONArray(
                            "options"
                    );

            String[] optionValues;

            if (options == null ||
                    options.length() == 0) {

                optionValues =
                        new String[] {
                                "No options available"
                        };

            } else {

                optionValues =
                        new String[
                                options.length()
                        ];

                for (
                        int i = 0;
                        i < options.length();
                        i++
                ) {

                    JSONObject option =
                            options.getJSONObject(i);

                    optionValues[i] =
                            option.optString(
                                    "value",
                                    option.optString(
                                            "label",
                                            "Option " + (i + 1)
                                    )
                            );
                }
            }

            Spinner spinner =
                    new Spinner(requireContext());

            ArrayAdapter<String> adapter =
                    new ArrayAdapter<>(
                            requireContext(),
                            android.R.layout.simple_spinner_item,
                            optionValues
                    );

            adapter.setDropDownViewResource(
                    android.R.layout.simple_spinner_dropdown_item
            );

            spinner.setAdapter(
                    adapter
            );

            answerViews.put(
                    fieldId,
                    spinner
            );

            formContainer.addView(
                    spinner
            );

        } catch (Exception e) {

            showMessage(
                    "Could not load dropdown options:\n" +
                    e.getMessage()
            );
        }
    }

    private void createCheckboxInput(
            int fieldId) {

        CheckBox checkbox =
                new CheckBox(requireContext());

        checkbox.setText(
                "Yes"
        );

        answerViews.put(
                fieldId,
                checkbox
        );

        formContainer.addView(
                checkbox
        );
    }

    private void createMultiSelectInput(
            int fieldId,
            JSONObject field) {

        try {

            JSONArray options =
                    field.optJSONArray(
                            "options"
                    );

            if (options == null ||
                    options.length() == 0) {

                showMessage(
                        "No options available."
                );

                return;
            }

            LinearLayout optionsContainer =
                    new LinearLayout(
                            requireContext()
                    );

            optionsContainer.setOrientation(
                    LinearLayout.VERTICAL
            );

            for (
                    int i = 0;
                    i < options.length();
                    i++
            ) {

                JSONObject option =
                        options.getJSONObject(i);

                String optionText =
                        option.optString(
                                "value",
                                option.optString(
                                        "label",
                                        "Option " +
                                        (i + 1)
                                )
                        );

                CheckBox checkbox =
                        new CheckBox(
                                requireContext()
                        );

                checkbox.setText(
                        optionText
                );

                optionsContainer.addView(
                        checkbox
                );
            }

            answerViews.put(
                    fieldId,
                    optionsContainer
            );

            formContainer.addView(
                    optionsContainer
            );

        } catch (Exception e) {

            showMessage(
                    "Could not load multi-select options:\n" +
                    e.getMessage()
            );
        }
    }

private void fillExistingAnswers() {

    if (existingSubmission == null) {
        return;
    }

    JSONArray answers =
            existingSubmission.optJSONArray(
                    "answers"
            );

    if (answers == null) {
        return;
    }

    try {

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

            String value =
                    answer.optString(
                            "value",
                            ""
                    );

            View input =
                    answerViews.get(
                            fieldId
                    );

            if (input == null) {
                continue;
            }

            setAnswerValue(
                    input,
                    value
            );
        }

    } catch (Exception e) {

        Log.e(
                "GrizzlyScout",
                "Could not fill existing answers",
                e
        );

        Toast.makeText(
                requireContext(),
                "Could not load some saved answers.",
                Toast.LENGTH_LONG
        ).show();
    }
}

private void setAnswerValue(
        View input,
        String value) {

    if (input instanceof EditText) {

        ((EditText) input)
                .setText(
                        value
                );

        return;
    }

    if (input instanceof Spinner) {

        Spinner spinner =
                (Spinner) input;

        for (
                int i = 0;
                i < spinner.getCount();
                i++
        ) {

            Object item =
                    spinner.getItemAtPosition(
                            i
                    );

            if (item != null &&
                    value.equals(
                            item.toString()
                    )) {

                spinner.setSelection(
                        i
                );

                break;
            }
        }

        return;
    }

    if (input instanceof RadioGroup) {

        RadioGroup group =
                (RadioGroup) input;

        for (
                int i = 0;
                i < group.getChildCount();
                i++
        ) {

            View child =
                    group.getChildAt(
                            i
                    );

            if (child instanceof RadioButton) {

                RadioButton button =
                        (RadioButton) child;

                if (value.equalsIgnoreCase(
                        button.getText().toString()
                )) {

                    button.setChecked(
                            true
                    );

                    break;
                }
            }
        }

        return;
    }

    if (input instanceof CheckBox) {

        ((CheckBox) input)
                .setChecked(
                        value.equalsIgnoreCase(
                                "true"
                        ) ||
                        value.equalsIgnoreCase(
                                "yes"
                        )
                );

        return;
    }

    if (input instanceof LinearLayout) {

        try {

            JSONArray selectedValues =
                    new JSONArray(
                            value
                    );

            for (
                    int i = 0;
                    i < ((LinearLayout) input)
                            .getChildCount();
                    i++
            ) {

                View child =
                        ((LinearLayout) input)
                                .getChildAt(
                                        i
                                );

                if (!(child instanceof CheckBox)) {
                    continue;
                }

                CheckBox checkbox =
                        (CheckBox) child;

                for (
                        int j = 0;
                        j < selectedValues.length();
                        j++
                ) {

                    if (checkbox.getText()
                            .toString()
                            .equals(
                                    selectedValues
                                            .optString(j)
                            )) {

                        checkbox.setChecked(
                                true
                        );

                        break;
                    }
                }
            }

        } catch (Exception ignored) {

            // A multi-select value that isn't valid JSON
            // is treated as having no selected options.
        }
    }
}

private void submitForm() {

   JSONArray answers =
        new JSONArray();

    JSONObject submission =
            new JSONObject();

    try {

        int teamNumber = 0;
        String scoutName = "";

        for (
                Map.Entry<Integer, View> entry
                : answerViews.entrySet()
        ) {

            int fieldId =
                    entry.getKey();

            View input =
                    entry.getValue();

            Object answer =
                    getAnswerValue(
                            input
                    );

          JSONObject answerObject =
        new JSONObject();

answerObject.put(
        "gameFormFieldId",
        fieldId
);

answerObject.put(
        "value",
        answer == null
                ? ""
                : answer.toString()
);

answers.put(
        answerObject
);
        }

      // Read the system fields dynamically from the current form.

if (teamNumberFieldId > 0) {

    View teamView =
            answerViews.get(
                    teamNumberFieldId
            );

    if (teamView instanceof EditText) {

        String value =
                ((EditText) teamView)
                        .getText()
                        .toString()
                        .trim();

        if (!value.isEmpty()) {

            teamNumber =
                    Integer.parseInt(
                            value
                    );
        }
    }
}

if (scoutNameFieldId > 0) {

    View scoutView =
            answerViews.get(
                    scoutNameFieldId
            );

    if (scoutView instanceof EditText) {

        scoutName =
                ((EditText) scoutView)
                        .getText()
                        .toString()
                        .trim();
    }
}

        if (teamNumber <= 0) {

            Toast.makeText(
                    requireContext(),
                    "Please enter a valid Team Number.",
                    Toast.LENGTH_LONG
            ).show();

            return;
        }

        if (scoutName.isEmpty()) {

            Toast.makeText(
                    requireContext(),
                    "Please enter your Scout Name.",
                    Toast.LENGTH_LONG
            ).show();

            return;
        }

      boolean isMatchForm =
        currentFormType.equalsIgnoreCase(
                "Match"
        ) ||
        currentFormType.equals(
                "1"
        );

int matchNumber = 0;

if (isMatchForm) {

    if (eventId <= 0) {

        Toast.makeText(
                requireContext(),
                "Please select an event before submitting.",
                Toast.LENGTH_LONG
        ).show();

        return;
    }

    if (matchNumberFieldId <= 0) {

        Toast.makeText(
                requireContext(),
                "This match form does not contain a Match Number field.",
                Toast.LENGTH_LONG
        ).show();

        return;
    }

    View matchView =
            answerViews.get(
                    matchNumberFieldId
            );

    if (matchView instanceof EditText) {

        String matchValue =
                ((EditText) matchView)
                        .getText()
                        .toString()
                        .trim();

        if (!matchValue.isEmpty()) {

            matchNumber =
                    Integer.parseInt(
                            matchValue
                    );
        }
    }

    if (matchNumber <= 0) {

        Toast.makeText(
                requireContext(),
                "Please enter a valid Match Number.",
                Toast.LENGTH_LONG
        ).show();

        return;
    }
}

submission.put(
        "gameFormId",
        formId
);

if (isMatchForm) {

    submission.put(
            "eventId",
            eventId
    );

    submission.put(
            "matchType",
            "Qualification"
    );

    submission.put(
            "matchNumber",
            matchNumber
    );

    submission.put(
            "setNumber",
            0
    );
}
        submission.put(
                "teamNumber",
                teamNumber
        );

        submission.put(
                "scoutName",
                scoutName
        );

        submission.put(
                "answers",
                answers
        );

        if (submitButton != null) {

            submitButton.setEnabled(
                    false
            );

            submitButton.setText(
                    "Submitting..."
            );
        }

        new Thread(() -> {

            try {

                JSONObject result =
                        GameFormApi.submitSubmission(
                                submission
                        );

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(
                                () -> {

                                    Toast.makeText(
                                            requireContext(),
                                            "Submission saved! ID: " +
                                            result.optInt(
                                                    "id"
                                            ),
                                            Toast.LENGTH_LONG
                                    ).show();

                                    if (
                                            submitButton != null
                                    ) {

                                        submitButton.setEnabled(
                                                true
                                        );

                                        submitButton.setText(
                                                "Submit Form"
                                        );
                                    }
                                }
                        );

            } catch (Exception e) {

                if (!isAdded()) {
                    return;
                }

                requireActivity()
                        .runOnUiThread(
                                () -> {

                                    Toast.makeText(
                                            requireContext(),
                                            "Submission failed: " +
                                            e.getMessage(),
                                            Toast.LENGTH_LONG
                                    ).show();

                                    if (
                                            submitButton != null
                                    ) {

                                        submitButton.setEnabled(
                                                true
                                        );

                                        submitButton.setText(
                                                "Submit Form"
                                        );
                                    }
                                }
                        );
            }

        }).start();

    } catch (Exception e) {

        Toast.makeText(
                requireContext(),
                "Error preparing submission: " +
                e.getMessage(),
                Toast.LENGTH_LONG
        ).show();

        if (submitButton != null) {

            submitButton.setEnabled(
                    true
            );

            submitButton.setText(
                    "Submit Form"
            );
        }
    }
}
private Object getAnswerValue(
        View input) {

    if (input instanceof EditText) {

        return ((EditText) input)
                .getText()
                .toString()
                .trim();
    }

    if (input instanceof Spinner) {

        Object selected =
                ((Spinner) input)
                        .getSelectedItem();

        return selected != null
                ? selected.toString()
                : "";
    }

    if (input instanceof RadioGroup) {

        RadioGroup group =
                (RadioGroup) input;

        int selectedId =
                group.getCheckedRadioButtonId();

        if (selectedId == -1) {
            return "";
        }

        RadioButton selectedButton =
                group.findViewById(
                        selectedId
                );

        return selectedButton != null
                ? selectedButton
                    .getText()
                    .toString()
                : "";
    }

    if (input instanceof CheckBox) {

        return ((CheckBox) input)
                .isChecked();
    }

    if (input instanceof LinearLayout) {

        LinearLayout layout =
                (LinearLayout) input;

        JSONArray selectedValues =
                new JSONArray();

        for (
                int i = 0;
                i < layout.getChildCount();
                i++
        ) {

            View child =
                    layout.getChildAt(i);

            if (child instanceof CheckBox) {

                CheckBox checkbox =
                        (CheckBox) child;

                if (checkbox.isChecked()) {

                    selectedValues.put(
                            checkbox
                                    .getText()
                                    .toString()
                    );
                }
            }
        }

        return selectedValues;
    }

    return "";
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
                17
        );

        messageView.setPadding(
                0,
                16,
                0,
                16
        );

        formContainer.addView(
                messageView
        );
    }
}
