package com.ycsrobotics.grizzlyscout;

import android.net.Uri;
import android.os.Bundle;

import android.os.Environment;
import android.util.Log;
import android.view.View;

import androidx.core.view.GravityCompat;
import androidx.appcompat.app.ActionBarDrawerToggle;

import android.view.MenuItem;

import com.google.android.material.navigation.NavigationView;

import androidx.drawerlayout.widget.DrawerLayout;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentTransaction;

import android.view.Menu;
import android.widget.TextView;
import android.graphics.Color;
import com.journeyapps.barcodescanner.ScanContract;
import com.journeyapps.barcodescanner.ScanOptions;

import java.sql.Connection;
import java.sql.Driver;
import java.sql.DriverManager;
import java.sql.SQLException;

public class MainActivity extends AppCompatActivity
        implements NavigationView.OnNavigationItemSelectedListener, EditTeamFragment.OnFragmentInteractionListener, HomePageFragment.OnFragmentInteractionListener,
        MatchSearchFragment.OnFragmentInteractionListener {

    private final androidx.activity.result.ActivityResultLauncher<ScanOptions> pairingScanner = registerForActivityResult(new ScanContract(), result -> {
        if (result.getContents() != null) applyPairingUri(android.net.Uri.parse(result.getContents()));
    });

    private void startPairingScan() { ScanOptions options = new ScanOptions(); options.setPrompt("Scan the host Pair Devices QR code"); options.setBeepEnabled(true); options.setOrientationLocked(false); pairingScanner.launch(options); }

    private void applyPairingUri(android.net.Uri data) {
        if (data != null && "grizzly".equals(data.getScheme()) && "pair".equals(data.getHost())) {
            String address = data.getQueryParameter("address"); if (address == null || !address.startsWith("http")) { android.widget.Toast.makeText(this, "Invalid pairing code", android.widget.Toast.LENGTH_LONG).show(); return; } com.ycsrobotics.grizzlyscout.Api.ApiConfig.clearManualOverride(); com.ycsrobotics.grizzlyscout.Api.ApiConfig.setDiscoveredBaseUrl(address); verifyPairedHost(address);
        }
    }

    private void verifyPairedHost(String address) {
        new Thread(() -> { try { java.net.URL url = new java.net.URL(address + "health"); java.net.HttpURLConnection c = (java.net.HttpURLConnection) url.openConnection(); c.setConnectTimeout(4000); c.setReadTimeout(4000); int code = c.getResponseCode(); runOnUiThread(() -> android.widget.Toast.makeText(this, code >= 200 && code < 300 ? "Host connected" : "Host responded with error " + code, android.widget.Toast.LENGTH_LONG).show()); } catch (java.net.UnknownHostException e) { runOnUiThread(() -> android.widget.Toast.makeText(this, "Host name could not be resolved. Check that both devices are on the same network.", android.widget.Toast.LENGTH_LONG).show()); } catch (java.net.ConnectException e) { runOnUiThread(() -> android.widget.Toast.makeText(this, "Host is unreachable. Check Wi-Fi and the host firewall.", android.widget.Toast.LENGTH_LONG).show()); } catch (Exception e) { runOnUiThread(() -> android.widget.Toast.makeText(this, "Could not connect. Check the network and host app.", android.widget.Toast.LENGTH_LONG).show()); } }).start();
    }

    private void applyPairingIntent(android.content.Intent intent) {
        android.net.Uri data = intent == null ? null : intent.getData();
        if (data != null && "grizzly".equals(data.getScheme()) && "pair".equals(data.getHost())) {
            String address = data.getQueryParameter("address"); if (address != null) { com.ycsrobotics.grizzlyscout.Api.ApiConfig.clearManualOverride(); com.ycsrobotics.grizzlyscout.Api.ApiConfig.setDiscoveredBaseUrl(address); }
        }
    }

    @Override
    protected void onResume() { super.onResume(); com.ycsrobotics.grizzlyscout.Api.HostDiscovery.restart(); }

    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        com.ycsrobotics.grizzlyscout.Api.ApiConfig.initialize(getApplicationContext());
        TextView connectionStatus = findViewById(R.id.connection_status);
        connectionStatus.setOnClickListener(v -> com.ycsrobotics.grizzlyscout.Api.HostDiscovery.restart());
        com.ycsrobotics.grizzlyscout.Api.HostDiscovery.start(getApplicationContext(), (state, host) -> runOnUiThread(() -> connectionStatus.setText((String)(host.isEmpty() ? state : state + " - " + host))));
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        DrawerLayout drawer = findViewById(R.id.drawer_layout);
        NavigationView navigationView = findViewById(R.id.nav_view);
        ActionBarDrawerToggle toggle = new ActionBarDrawerToggle(
                this, drawer, toolbar, R.string.navigation_drawer_open, R.string.navigation_drawer_close);
        drawer.addDrawerListener(toggle);
        toggle.syncState();
        navigationView.setNavigationItemSelectedListener(this);

        initializeDefaults();
        applyPairingIntent(getIntent());

        //load our database driver
        try {
            DriverManager.registerDriver((Driver) Class.forName("org.sqldroid.SQLDroidDriver").newInstance());
        } catch (Exception e) {
            Log.e(getString(R.string.app_name), "Failed to register SQLDroidDriver");
            throw new RuntimeException("Failed to register SQLDroidDriver");
        }

        String jdbcUrl = "jdbc:sqldroid:" + this.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) + "/matches.db";
        try {
            Connection connection = DriverManager.getConnection(jdbcUrl);

            Log.v(getString(R.string.app_name), "Using database directory ".concat(jdbcUrl));
            //TODO update for 2020 game
            connection.createStatement().execute("CREATE TABLE IF NOT EXISTS MATCHES (UniqueKey integer primary key, Match_Number integer, Team_Number integer, " +
                    "Sandstorm_Hab_Level integer, Sandstorm_Cargoship_Hatches_Scored integer, Sandstorm_Cargoship_Cargo_Scored integer, " +
                    "Sandstorm_Low_Hatches_Scored integer, Sandstorm_Low_Cargo_Scored integer, Sandstorm_Mid_Hatches_Scored integer, " +
                    "Sandstorm_Mid_Cargo_Scored integer, Sandstorm_High_Hatches_Scored integer, Sandstorm_High_Cargo_Scored integer, " +
                    "Sandstorm_Hatches_Dropped integer, Sandstorm_Cargo_Dropped integer, Teleop_Cargoship_Hatches_Scored integer, " +
                    "Teleop_Cargoship_Cargo_Scored integer, Teleop_Low_Hatches_Scored integer, Teleop_Low_Cargo_Scored integer," +
                    "Teleop_Mid_Hatches_Scored integer, Teleop_Mid_Cargo_Scored integer, Teleop_High_Hatches_Scored integer," +
                    "Teleop_High_Cargo_Scored integer, Teleop_Hatches_Dropped integer, Teleop_Cargo_Dropped integer," +
                    "MechanicalIssues integer, AdditionalNotes string)");
            connection.close();

            Log.i(getString(R.string.app_name), "Connection to local grizzlyscout_icon database successful!");
        } catch (SQLException e) {
            Log.e(getString(R.string.app_name), "Error connecting to grizzlyscout_icon database!", e);
            throw new RuntimeException(e);
        }
    }

        public void initializeDefaults() {
            TextView view = findViewById(R.id.bottom_nav_version);
            view.setText(getString(R.string.app_name).concat(" Version: ").concat(BuildConfig.VERSION_NAME));

        view.setOnLongClickListener(v -> { showDeveloperApiSettings(); return true; });

        showSplashFragment(null);
    }

    @Override
    public void onBackPressed() {
        DrawerLayout drawer = findViewById(R.id.drawer_layout);
        if (drawer.isDrawerOpen(GravityCompat.START)) {
            drawer.closeDrawer(GravityCompat.START);
        } else {
            super.onBackPressed();
        }
    }

    public void showFragment(Fragment fragment) {
        FragmentManager fm = getSupportFragmentManager();
        FragmentTransaction transaction = fm.beginTransaction();
        transaction.setCustomAnimations(android.R.animator.fade_in, android.R.animator.fade_out);
        transaction.replace(R.id.contentFragment, fragment);
        transaction.addToBackStack(null);
        transaction.commit();
    }

    private void showDeveloperApiSettings() {
        final android.widget.EditText pin = new android.widget.EditText(this); pin.setInputType(2 | 16);
        new androidx.appcompat.app.AlertDialog.Builder(this).setTitle("Developer Access").setMessage("Enter developer PIN").setView(pin).setNegativeButton("Cancel", null).setPositiveButton("Unlock", (d,w) -> {
            if (BuildConfig.DEV_API_PIN.equals(pin.getText().toString())) {
                final android.widget.EditText input = new android.widget.EditText(this); input.setSingleLine(true); input.setText(com.ycsrobotics.grizzlyscout.Api.ApiConfig.getBaseUrl());
                new androidx.appcompat.app.AlertDialog.Builder(this).setTitle("Developer API Settings").setView(input).setNegativeButton("Cancel", null).setPositiveButton("Save", (d2,w2) -> com.ycsrobotics.grizzlyscout.Api.ApiConfig.setBaseUrl(input.getText().toString())).show();
            } else android.widget.Toast.makeText(this, "Incorrect developer PIN", android.widget.Toast.LENGTH_SHORT).show();
        }).show();
    }

   @Override
public boolean onNavigationItemSelected(MenuItem item) {

    int id = item.getItemId();

    if (id == R.id.nav_scan_pairing) {
        startPairingScan();
    } else if (id == R.id.nav_home) {

        Log.i(
                getString(R.string.app_name),
                "Home option has been selected"
        );

        showFragment(
                new HomePageFragment()
        );

        } else if (id == R.id.nav_alliance_plan) {
        showFragment(new AlliancePlanFragment());
    } else if (id == R.id.scout_new_team) {

        Log.i(
                getString(R.string.app_name),
                "Scout New Team option has been selected"
        );

        showFragment(
                new EditTeamFragment()
        );

    } else if (id == R.id.edit_existing_team) {

        Log.i(
                getString(R.string.app_name),
                "Edit Existing Team option has been selected"
        );

        showFragment(
                new MatchSearchFragment()
        );
    }

    DrawerLayout drawer =
            findViewById(
                    R.id.drawer_layout
            );

    drawer.closeDrawer(
            GravityCompat.START
    );

    return true;
}

    @Override
    public void onFragmentInteraction(Uri uri) {

    }

    public void showSplashFragment(View view) {
        Fragment fragmentSplash = new LandingFragment();

        FragmentManager fm = getSupportFragmentManager();
        FragmentTransaction transaction = fm.beginTransaction();
        transaction.replace(R.id.contentFragment, fragmentSplash);
        transaction.commit();
    }
}
