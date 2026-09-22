package com.ycsrobotics.grizzlyscout.Api;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Finds and tracks the host API on the local network. */
public final class HostDiscovery {
    public interface Listener { void onState(String state, String hostName); }
    private static final int DISCOVERY_PORT = 5264;
    private static final String PREFIX = "GRIZZLY_SCOUT_API|1|5263|";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static volatile boolean running;
    private static volatile Listener listener;
    private HostDiscovery() { }

    public static synchronized void start(Listener newListener) {
        listener = newListener;
        if (running || ApiConfig.hasManualOverride()) { notifyState(ApiConfig.hasManualOverride() ? "Manual host" : "Searching for host...", ""); return; }
        running = true;
        notifyState("Searching for host...", "");
        EXECUTOR.execute(HostDiscovery::listen);
    }
    public static synchronized void restart() { running = false; start(listener); }
    public static synchronized void stop() { running = false; }
    private static void notifyState(String state, String host) { if (listener != null) listener.onState(state, host); }
    private static void listen() {
        try (DatagramSocket socket = new DatagramSocket(null)) {
            socket.setReuseAddress(true); socket.bind(new InetSocketAddress(DISCOVERY_PORT)); socket.setBroadcast(true); socket.setSoTimeout(3000);
            byte[] buffer = new byte[512];
            while (running && !ApiConfig.hasManualOverride()) {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(packet);
                    String message = new String(packet.getData(), packet.getOffset(), packet.getLength(), StandardCharsets.UTF_8);
                    if (message.startsWith(PREFIX)) {
                        String[] parts = message.split("\\|", 5);
                        String host = parts.length > 4 ? parts[4] : "Grizzly host";
                        ApiConfig.setDiscoveredBaseUrl("http://" + packet.getAddress().getHostAddress() + ":5263/api/");
                        notifyState("Connected to host", host);
                    }
                } catch (java.net.SocketTimeoutException ignored) { }
            }
        } catch (Exception ignored) { notifyState("Host unavailable - tap to retry", ""); }
        finally { running = false; }
    }
}