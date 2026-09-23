package com.ycsrobotics.grizzlyscout;

import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.fragment.app.Fragment;

import com.ycsrobotics.grizzlyscout.Api.GameFormApi;

import org.json.JSONObject;

public class HomePageFragment extends Fragment {

    private OnFragmentInteractionListener mListener;

    public HomePageFragment() {
    }

    @Override
    public View onCreateView(
            LayoutInflater inflater,
            ViewGroup container,
            Bundle savedInstanceState) {

        return inflater.inflate(
                R.layout.fragment_splash,
                container,
                false
        );
    }

    @Override
    public void onViewCreated(
            View view,
            Bundle savedInstanceState) {

        super.onViewCreated(
                view,
                savedInstanceState
        );

        view.findViewById(R.id.alliancePlanButton).setOnClickListener(v ->
                ((MainActivity) requireActivity()).showFragment(new AlliancePlanFragment()));

        view.findViewById(R.id.newMatchFormButton).setOnClickListener(v -> showScoutOptions());
        view.findViewById(R.id.currentEventButton).setOnClickListener(v -> ((MainActivity) requireActivity()).showFragment(new NexusEventFragment()));
        view.findViewById(R.id.pitMapButton).setOnClickListener(v -> ((MainActivity) requireActivity()).showFragment(new PitMapFragment()));
        TextView queueStatus = view.findViewById(R.id.nexusQueueStatus);
        new Thread(() -> { try { org.json.JSONObject snap = com.ycsrobotics.grizzlyscout.Api.NexusApi.getSnapshot(); String q = snap.optJSONObject("status") == null ? "None" : snap.optJSONObject("status").optString("nowQueuing", "None"); requireActivity().runOnUiThread(() -> queueStatus.setText("NEXUS QUEUING: " + q)); } catch (Exception e) { requireActivity().runOnUiThread(() -> queueStatus.setText("NEXUS: Offline")); } }).start();

        Button fillOutPitForm =
                view.findViewById(
                        R.id.newPitFormButton
                );

        Button fillOutMatchForm =
                view.findViewById(
                        R.id.newMatchFormButton
                );

        Button editSubmittedForms =
                view.findViewById(
                        R.id.editSubmittedFormsButton
                );

        fillOutPitForm.setOnClickListener(
                v -> openActivePitForm()
        );

        fillOutMatchForm.setOnClickListener(
                v -> openActiveMatchForm()
        );

        editSubmittedForms.setOnClickListener(v -> {

            SubmittedTeamsFragment fragment =
                    new SubmittedTeamsFragment();

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
                    .addToBackStack(null)
                    .commit();
        });
    }

    private void showScoutOptions() {
        new androidx.appcompat.app.AlertDialog.Builder(requireContext()).setTitle("Scout").setItems(new String[]{"Match scouting", "Pit scouting", "Review submitted forms", "Edit submitted forms"}, (dialog, which) -> {
            if (which == 0) openActiveMatchForm();
            else if (which == 1) openActivePitForm();
            else { requireActivity().getSupportFragmentManager().beginTransaction().replace(R.id.contentFragment, new SubmittedTeamsFragment()).addToBackStack(null).commit(); }
        }).show();
    }

    private void openActivePitForm() {

        new Thread(() -> {

            try {

                JSONObject configuration =
                        GameFormApi.getActiveScoutingConfiguration();

                int formId =
                        configuration.optInt(
                                "activePitFormId",
                                0
                        );

                if (formId <= 0) {

                    showMessage(
                            "No active Pit Form has been pushed by the admin."
                    );

                    return;
                }

                openPitForm(
                        formId
                );

            } catch (Exception e) {

                showMessage(
                        "Could not load active Pit Form:\n" +
                        e.getMessage()
                );
            }

        }).start();
    }

    private void openActiveMatchForm() {

        new Thread(() -> {

            try {

                JSONObject configuration =
                        GameFormApi.getActiveScoutingConfiguration();

                int formId =
                        configuration.optInt(
                                "activeMatchFormId",
                                0
                        );

                if (formId <= 0) {

                    showMessage(
                            "No active Match Form has been pushed by the admin."
                    );

                    return;
                }

                openMatchForm(
        formId
);

            } catch (Exception e) {

                showMessage(
                        "Could not load active Match Form:\n" +
                        e.getMessage()
                );
            }

        }).start();
    }

    private void openPitForm(int formId) {
        new Thread(() -> {
            try {
                GameFormApi.EventSelection selection = GameFormApi.getEventSelection(formId);
                java.util.ArrayList<String> eventNames = new java.util.ArrayList<>();
                java.util.ArrayList<Integer> eventIds = new java.util.ArrayList<>();
                for (int i = 0; i < selection.events.length(); i++) {
                    JSONObject event = selection.events.getJSONObject(i);
                    eventIds.add(event.getInt("id"));
                    eventNames.add(event.optString("name", "Unnamed Event"));
                }
                if (eventIds.isEmpty()) {
                    showMessage("No events are available for this form's season.");
                    return;
                }
                if (!isAdded()) {
                    return;
                }
                requireActivity().runOnUiThread(() -> {
                    if (!isAdded() || getView() == null) {
                        return;
                    }
                    if (selection.preset) {
                        openPitFormWithEvent(formId, eventIds.get(0), eventNames.get(0));
                        return;
                    }
                    android.widget.Spinner spinner = new android.widget.Spinner(requireContext());
                    android.widget.ArrayAdapter<String> adapter = new android.widget.ArrayAdapter<>(
                            requireContext(), android.R.layout.simple_spinner_item, eventNames);
                    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
                    spinner.setAdapter(adapter);
                    new androidx.appcompat.app.AlertDialog.Builder(requireContext())
                            .setTitle("Select Event")
                            .setMessage("Choose the event you are scouting.")
                            .setView(spinner)
                            .setNegativeButton("Cancel", null)
                            .setPositiveButton("Continue", (dialog, which) -> {
                                int position = spinner.getSelectedItemPosition();
                                if (position >= 0 && position < eventIds.size()) {
                                    openPitFormWithEvent(formId, eventIds.get(position), eventNames.get(position));
                                }
                            })
                            .show();
                });
            } catch (Exception e) {
                showMessage("Could not load events:\n" + e.getMessage());
            }
        }).start();
    }

    private void openPitFormWithEvent(int formId, int eventId, String eventName) {
        if (!isAdded()) {
            return;
        }
        Bundle arguments = new Bundle();
        arguments.putInt("formId", formId);
        arguments.putInt("eventId", eventId);
        arguments.putString("eventName", eventName);
        DynamicScoutingFormFragment fragment = new DynamicScoutingFormFragment();
        fragment.setArguments(arguments);
        requireActivity().getSupportFragmentManager().beginTransaction()
                .setCustomAnimations(android.R.animator.fade_in, android.R.animator.fade_out)
                .replace(R.id.contentFragment, fragment)
                .addToBackStack(null)
                .commit();
    }

  private void openMatchForm(
        int formId) {

    if (!isAdded()) {
        return;
    }

    requireActivity()
            .runOnUiThread(() -> {

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
                        .addToBackStack(null)
                        .commit();
            });
}

    private void showMessage(
            String message) {

        if (!isAdded()) {
            return;
        }

        requireActivity()
                .runOnUiThread(() -> {

                    if (!isAdded()) {
                        return;
                    }

                    Toast.makeText(
                            requireContext(),
                            message,
                            Toast.LENGTH_LONG
                    ).show();
                });
    }

    @Override
    public void onDetach() {

        super.onDetach();

        mListener = null;
    }

    public interface OnFragmentInteractionListener {

        void onFragmentInteraction(
                Uri uri
        );
    }
}



