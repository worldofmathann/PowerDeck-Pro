package com.powerdeckpro;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.UUID;

/**
 * PowerDeck Pro - Java Core Authentication & Profile Synthesizer
 * Supports:
 * 1. Phone number login (OTP) with synchronized Device ID session lock
 * 2. Password login
 * 3. Token direct login
 * 4. Automatic profile.json generation with Agora Engine configuration
 * 5. Direct storage to %APPDATA%/powerdeckpro/profile.json
 */
public class PowerDeckAuth {

    public static final String AGORA_KEY = "938de3e8055e42b281bb8c6f69c21f78";
    public static final String PUBNUB_PUB_KEY = "pub-c-6878d382-5ae6-4494-9099-f930f938868b";
    public static final String PUBNUB_SUB_KEY = "sub-c-a4abea84-9ca3-11ea-8e71-f2b83ac9263d";

    private final HttpClient client;
    private String activeDeviceId;

    public PowerDeckAuth() {
        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .build();
        this.activeDeviceId = generateDeviceId();
    }

    public static String generateDeviceId() {
        return UUID.randomUUID().toString().toUpperCase();
    }

    public static String generateSessionId() {
        return UUID.randomUUID().toString().toUpperCase();
    }

    public String getActiveDeviceId() {
        return this.activeDeviceId;
    }

    public void setActiveDeviceId(String deviceId) {
        this.activeDeviceId = deviceId;
    }

    public static Path getProfilePath() throws IOException {
        String appdata = System.getenv("APPDATA");
        if (appdata == null) {
            appdata = System.getProperty("user.home");
        }
        Path dir = Paths.get(appdata, "powerdeckpro");
        if (!Files.exists(dir)) {
            Files.createDirectories(dir);
        }
        return dir.resolve("profile.json");
    }

    /**
     * Step 1: Start phone auth with locked device_id
     */
    public String startPhoneAuth(String phoneNumber) throws IOException, InterruptedException {
        String jsonPayload = String.format("{\"phone_number\": \"%s\"}", phoneNumber);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://www.clubhouseapi.com/api/start_phone_number_auth"))
                .header("User-Agent", "clubhouse/android")
                .header("User-Agent-Static", "clubhouse/2640 (iPhone; iOS 17.1.2; Scale/3.00)")
                .header("CH-Languages", "en-US")
                .header("CH-Locale", "en_US")
                .header("CH-AppVersion", "24.01.02")
                .header("CH-AppBuild", "2640")
                .header("CH-DeviceId", this.activeDeviceId)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("Accept-Language", "en-US;q=1")
                .header("CH-Timezone", "Asia/Tehran")
                .timeout(Duration.ofSeconds(20))
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    /**
     * Step 2: Complete phone auth with identical device_id
     */
    public String completePhoneAuth(String phoneNumber, String verificationCode) throws IOException, InterruptedException {
        String jsonPayload = String.format("{\"phone_number\": \"%s\", \"verification_code\": \"%s\"}",
                phoneNumber, verificationCode);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://www.clubhouseapi.com/api/complete_phone_number_auth"))
                .header("User-Agent", "clubhouse/android")
                .header("User-Agent-Static", "clubhouse/2640 (iPhone; iOS 17.1.2; Scale/3.00)")
                .header("CH-Languages", "en-US")
                .header("CH-Locale", "en_US")
                .header("CH-AppVersion", "24.01.02")
                .header("CH-AppBuild", "2640")
                .header("CH-DeviceId", this.activeDeviceId)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("Accept-Language", "en-US;q=1")
                .header("CH-Timezone", "Asia/Tehran")
                .timeout(Duration.ofSeconds(20))
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    /**
     * Password authentication
     */
    public String completePasswordAuth(String phoneNumber, String password) throws IOException, InterruptedException {
        String sessionId = generateSessionId();
        String jsonPayload = String.format(
                "{\"notification_permission_status\":false,\"password\":\"%s\",\"microphone_permission_status\":false,\"phone_number\":\"%s\",\"contact_permission_status\":false}",
                password.replace("\"", "\\\""), phoneNumber
        );

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://www.clubhouseapi.com/api/complete_password_auth"))
                .header("Accept", "application/json")
                .header("Accept-Language", "en-IN,en;q=0.9")
                .header("CH-AppBuild", "4427")
                .header("CH-AppID", "clubhouse")
                .header("CH-AppVersion", "26.04.28")
                .header("CH-DeviceId", this.activeDeviceId)
                .header("CH-Keyboards", "en_IN,emoji,ta")
                .header("CH-Languages", "en-IN,ta-IN")
                .header("CH-Locale", "en_IN")
                .header("CH-Session-Id", sessionId)
                .header("CH-Storefront-Country-Code", "IND")
                .header("Connection", "keep-alive")
                .header("Content-Type", "application/json; charset=utf-8")
                .header("Host", "www.clubhouseapi.com")
                .header("User-Agent", "clubhouse/4427 (iPhone; iOS 26.4.2; Scale/3.00)")
                .timeout(Duration.ofSeconds(20))
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    /**
     * Query /api/me using token
     */
    public String getUserProfile(String token) throws IOException, InterruptedException {
        String cleanToken = token.startsWith("Token ") ? token : "Token " + token;
        String jsonPayload = "{\"return_blocked_ids\":true,\"timezone_identifier\":\"Asia/Calcutta\",\"return_following_ids\":true}";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://www.clubhouseapi.com/api/me"))
                .header("Authorization", cleanToken)
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(20))
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    /**
     * Save profile JSON directly to %APPDATA%/powerdeckpro/profile.json
     */
    public Path saveProfileJson(String profileJsonContent) throws IOException {
        Path path = getProfilePath();
        Files.writeString(path, profileJsonContent);
        return path;
    }

    public static void main(String[] args) {
        System.out.println("PowerDeck Pro Java Core Initialized");
        System.out.println("Agora Key Configured: " + AGORA_KEY);
        try {
            System.out.println("Target Profile Location: " + getProfilePath().toAbsolutePath());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
