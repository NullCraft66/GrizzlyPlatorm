package com.ycsrobotics.grizzlyscout;

import android.content.Context;
import android.net.Uri;
import android.os.Bundle;

import androidx.fragment.app.Fragment;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;

import com.ycsrobotics.grizzlyscout.AsyncDatabaseTasks.UpdateTeamMatchTask;
import com.ycsrobotics.grizzlyscout.CompetitionObjects.Match;


/**
 * A simple {@link Fragment} subclass.
 * Activities that contain this fragment must implement the
 * {@link EditTeamFragment.OnFragmentInteractionListener} interface
 * to handle interaction events.
 * Use the {@link EditTeamFragment#newInstance} factory method to
 * create an instance of this fragment.
 */
public class EditTeamFragment extends Fragment {
    // TODO: Rename parameter arguments, choose names that match
    // the fragment initialization parameters, e.g. ARG_ITEM_NUMBER
    private static final String ARG_PARAM1 = "param1";
    private static final String ARG_PARAM2 = "param2";

    // TODO: Rename and change types of parameters
    private String mParam1;
    private String mParam2;

    private OnFragmentInteractionListener mListener;

    public EditTeamFragment() {
        // Required empty public constructor
    }

    /**
     * Use this factory method to create a new instance of
     * this fragment using the provided parameters.
     *
     * @param param1 Parameter 1.
     * @param param2 Parameter 2.
     * @return A new instance of fragment EditTeamFragment.
     */
    // TODO: Rename and change types and number of parameters
    public static EditTeamFragment newInstance(String param1, String param2) {
        EditTeamFragment fragment = new EditTeamFragment();
        Bundle args = new Bundle();
        args.putString(ARG_PARAM1, param1);
        args.putString(ARG_PARAM2, param2);
        fragment.setArguments(args);
        return fragment;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getArguments() != null) {
            mParam1 = getArguments().getString(ARG_PARAM1);
            mParam2 = getArguments().getString(ARG_PARAM2);
        }
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        // Inflate the layout for this fragment
        return inflater.inflate(R.layout.fragment_new_team, container, false);
    }

    // TODO: Rename method, update argument and hook method into UI event
    public void onButtonPressed(Uri uri) {
        if (mListener != null) {
            mListener.onFragmentInteraction(uri);
        }
    }

    @Override
    public void onViewCreated(View view, Bundle savedInstanceState) {
        Button button = getActivity().findViewById(R.id.syncButton);
        EditText matchNumber = getActivity().findViewById(R.id.matchNumber);
        EditText teamNumber = getActivity().findViewById(R.id.teamNumber);
        EditText teleopHatchesScored = getActivity().findViewById(R.id.hatchesScoredTeleop);

        button.setOnClickListener(v -> {
    String matchText = matchNumber.getText().toString().trim();
    String teamText = teamNumber.getText().toString().trim();
    String hatchesText = teleopHatchesScored.getText().toString().trim();

    if (matchText.isEmpty()) {
        matchNumber.setError("Enter a match number");
        matchNumber.requestFocus();
        return;
    }

    if (teamText.isEmpty()) {
        teamNumber.setError("Enter a team number");
        teamNumber.requestFocus();
        return;
    }

    if (hatchesText.isEmpty()) {
        teleopHatchesScored.setError("Enter hatches scored");
        teleopHatchesScored.requestFocus();
        return;
    }

    int intMatchNumber = Integer.parseInt(matchText);
    int intTeamNumber = Integer.parseInt(teamText);
    int intTeleopHatchesScored = Integer.parseInt(hatchesText);

    Match match = new Match(
            intMatchNumber,
            intTeamNumber,
            0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, intTeleopHatchesScored, 0, 0,
            0, 0, 0, 0, 0,
            0, null);

    UpdateTeamMatchTask teamMatchTask =
            new UpdateTeamMatchTask(getActivity(), match);

    teamMatchTask.execute("");
});
    }

    @Override
    public void onAttach(Context context) {
        super.onAttach(context);
        if (context instanceof OnFragmentInteractionListener) {
            mListener = (OnFragmentInteractionListener) context;
        } else {
            throw new RuntimeException(context.toString()
                    + " must implement OnFragmentInteractionListener");
        }
    }

    @Override
    public void onDetach() {
        super.onDetach();
        mListener = null;
    }

    /**
     * This interface must be implemented by activities that contain this
     * fragment to allow an interaction in this fragment to be communicated
     * to the activity and potentially other fragments contained in that
     * activity.
     * <p>
     * See the Android Training lesson <a href=
     * "http://developer.android.com/training/basics/fragments/communicating.html"
     * >Communicating with Other Fragments</a> for more information.
     */
    public interface OnFragmentInteractionListener {
        // TODO: Update argument type and name
        void onFragmentInteraction(Uri uri);
    }
}

