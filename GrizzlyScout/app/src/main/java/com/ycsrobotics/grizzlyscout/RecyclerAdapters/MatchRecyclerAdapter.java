package com.ycsrobotics.grizzlyscout.RecyclerAdapters;

import android.app.Activity;
import android.content.Context;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.ycsrobotics.grizzlyscout.AsyncDatabaseTasks.RefreshMatchesTask;
import com.ycsrobotics.grizzlyscout.CompetitionObjects.Match;
import com.ycsrobotics.grizzlyscout.R;

import java.util.ArrayList;

public class MatchRecyclerAdapter extends RecyclerView.Adapter<MatchRecyclerAdapter.MyViewHolder> {
    public MatchRecyclerAdapter(Context context) {
        RefreshMatchesTask refreshMatches = new RefreshMatchesTask(context, this);
        refreshMatches.execute();
    }

    private ArrayList<Match> dataset = new ArrayList<>();

    public static class MyViewHolder extends RecyclerView.ViewHolder {
        TextView match_number;
        TextView team_number;

        public MyViewHolder(@NonNull View itemView) {
            super(itemView);

            match_number = itemView.findViewById(R.id.MatchNumber);
            team_number = itemView.findViewById(R.id.TeamNumber);
        }
    }

    @NonNull
    @Override
    public MatchRecyclerAdapter.MyViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        Context context = parent.getContext();
        LayoutInflater inflater = LayoutInflater.from(context);

        View matchView = inflater.inflate(R.layout.match_row, parent, false);

        return new MyViewHolder(matchView);
    }

    @Override
    public void onBindViewHolder(@NonNull MatchRecyclerAdapter.MyViewHolder holder, int position) {
        TextView match_number = holder.match_number;
        TextView team_number = holder.team_number;

        //have to wrap setText calls with string, otherwise will crash with ResourcesNotFoundException
        match_number.setText(String.valueOf(dataset.get(position).getMatchNumber()));
        team_number.setText(String.valueOf(dataset.get(position).getTeamNumber()));
    }

    @Override
    public int getItemCount() {
        return dataset.size();
    }

    public void updateData(ArrayList<Match> data) {
        dataset.clear();
        dataset.addAll(data);

        notifyDataSetChanged();
    }
}
