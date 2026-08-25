package com.ycsrobotics.grizzlyscout.AsyncDatabaseTasks;

import android.app.Activity;
import android.os.AsyncTask;
import android.os.Environment;
import android.util.Log;
import android.widget.Toast;

import com.ycsrobotics.grizzlyscout.CompetitionObjects.Match;
import com.ycsrobotics.grizzlyscout.R;

import java.lang.ref.WeakReference;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;

public class UpdateTeamMatchTask extends AsyncTask<String, String, String> {
    private final WeakReference<Activity> myActivity;
    private final Match match;

    public UpdateTeamMatchTask(Activity activity, Match match) {
        myActivity = new WeakReference<>(activity);
        this.match = match;
    }

    @Override
    protected String doInBackground(String... strings) {

        String jdbcUrl = "jdbc:sqldroid:" + myActivity.get().getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) + "/matches.db";
        try {
            Connection connection = DriverManager.getConnection(jdbcUrl);

            //TODO update for 2020 game
            ResultSet data = connection.createStatement().executeQuery("SELECT * FROM MATCHES WHERE Match_Number=" + match.getMatchNumber() + " AND Team_Number=" + match.getTeamNumber());

            //insert if not exists otherwise update
            if (!data.next()) {
                connection.createStatement().execute("INSERT INTO MATCHES(Match_Number, Team_Number, Sandstorm_Hab_Level, Sandstorm_Cargoship_Hatches_Scored, Sandstorm_Cargoship_Cargo_Scored," +
                        "Sandstorm_Low_Hatches_Scored, Sandstorm_Low_Cargo_Scored, Sandstorm_Mid_Hatches_Scored," +
                        "Sandstorm_Mid_Cargo_Scored, Sandstorm_High_Hatches_Scored, Sandstorm_High_Cargo_Scored," +
                        "Sandstorm_Hatches_Dropped, Sandstorm_Cargo_Dropped, Teleop_Cargoship_Hatches_Scored, Teleop_Cargoship_Cargo_Scored," +
                        "Teleop_Low_Hatches_Scored, Teleop_Low_Cargo_Scored, Teleop_Mid_Hatches_Scored, Teleop_Mid_Cargo_Scored," +
                        "Teleop_High_Hatches_Scored, Teleop_High_Cargo_Scored, MechanicalIssues, AdditionalNotes) VALUES (" +
                        match.getMatchNumber() + "," +
                        match.getTeamNumber() + "," +
                        match.getSandstormHabLevel() + "," +
                        match.getSandstormCargoshipHatchesScored() + "," +
                        match.getSandstormCargoshipCargoScored() + "," +
                        match.getSandstormLowHatchesScored() + "," +
                        match.getSandstormLowCargoScored() + "," +
                        match.getSandstormMidHatchesScored() + "," +
                        match.getSandstormMidCargoScored() + "," +
                        match.getSandstormHighHatchesScored() + "," +
                        match.getSandstormHighCargoScored() + "," +
                        match.getSandstormHatchesDropped() + "," +
                        match.getSandstormCargoDropped() + "," +
                        match.getTeleopCargoshipHatchesScored() + "," +
                        match.getTeleopCargoshipCargoScored() + "," +
                        match.getTeleopLowHatchesScored() + "," +
                        match.getTeleopLowCargoScored() + "," +
                        match.getTeleopMidHatchesScored() + "," +
                        match.getTeleopMidCargoScored() + "," +
                        match.getTeleopHighHatchesScored() + "," +
                        match.getTeleopHighCargoScored() + "," +
                        match.getMechanicalIssues() + "," +
                        "null" +
                        ")");
            } else {
                //TODO implement update function
            }

            connection.close();
            Log.i(myActivity.get().getString(R.string.app_name), "InsertTeamQuerySuccessful!");
        } catch (SQLException e) {
            Log.e(myActivity.get().getString(R.string.app_name), "Error connecting to grizzlyscout_icon database!", e);
            throw new RuntimeException(e);
        }

        return null;
    }

    @Override
    protected void onPostExecute(String s) {
        super.onPostExecute(s);
        Toast.makeText(myActivity.get(), "Succesfully added ".concat(String.valueOf(match.getMatchNumber())).concat("/").concat(String.valueOf(match.getTeamNumber())).concat(" to the database!"), Toast.LENGTH_LONG).show();
    }
}
