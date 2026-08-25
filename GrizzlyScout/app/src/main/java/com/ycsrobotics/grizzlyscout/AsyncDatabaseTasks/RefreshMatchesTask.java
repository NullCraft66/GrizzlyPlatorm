package com.ycsrobotics.grizzlyscout.AsyncDatabaseTasks;

import android.app.Activity;
import android.content.Context;
import android.os.AsyncTask;
import android.os.Environment;
import android.util.Log;

import com.ycsrobotics.grizzlyscout.CompetitionObjects.Match;
import com.ycsrobotics.grizzlyscout.R;
import com.ycsrobotics.grizzlyscout.RecyclerAdapters.MatchRecyclerAdapter;

import java.lang.ref.WeakReference;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;

public class RefreshMatchesTask extends AsyncTask<String, String, String> {
    private WeakReference<Context> myActivity;
    private ArrayList<Match> matchArrayList = new ArrayList<>();
    private MatchRecyclerAdapter myAdapter;

    public RefreshMatchesTask(Context activity, MatchRecyclerAdapter adapter) {
        myActivity = new WeakReference<>(activity);
        myAdapter = adapter;
    }

    @Override
    protected String doInBackground(String... strings) {
        Log.v(myActivity.get().getString(R.string.app_name), "Retrieving match data from database for edit population!");

        String jdbcUrl = "jdbc:sqldroid:" + myActivity.get().getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) + "/matches.db";
        try {
            Connection connection = DriverManager.getConnection(jdbcUrl);

            ResultSet databaseMatchData = connection.createStatement().executeQuery("SELECT * FROM MATCHES");

            int err = 0;
            while (databaseMatchData.next()) {
                err++;
                Log.v(myActivity.get().getString(R.string.app_name), String.valueOf(databaseMatchData.getInt("Match_Number")));
                matchArrayList.add(new Match(databaseMatchData.getInt("Match_Number"), databaseMatchData.getInt("Team_Number"), 0
                , 0, 0, 0, 0
                ,0, 0, 0, 0, 0
                , 0, 0, 0, 0, 0, 0
                ,0 ,0 ,0,0 ,0 ,0 ,null));
            }

            if (err == 0) {
                Log.v(myActivity.get().getString(R.string.app_name), "There was no data from the database!");
            }

            connection.close();
        } catch (SQLException e) {
            Log.v(myActivity.get().getString(R.string.app_name), "Error refreshing matches history!", e);
        }
        return null;
    }

    @Override
    protected void onPostExecute(String result) {
        myAdapter.updateData(matchArrayList);
    }
}
