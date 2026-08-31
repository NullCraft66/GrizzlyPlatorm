package com.ycsrobotics.grizzlyscout;

import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;

import androidx.fragment.app.Fragment;

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

        fillOutPitForm.setOnClickListener(v -> {

            ScoutingFormFragment fragment =
                    ScoutingFormFragment.newInstance(
                            ScoutingFormFragment.PIT_FORM
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

        fillOutMatchForm.setOnClickListener(v -> {

            ScoutingFormFragment fragment =
                    ScoutingFormFragment.newInstance(
                            ScoutingFormFragment.MATCH_FORM
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