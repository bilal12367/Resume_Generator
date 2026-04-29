package com.example.main_app_server.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@Service
public class KeycloakService {

    private static final Logger log = LoggerFactory.getLogger(KeycloakService.class);


    @Value("${keycloak.server-url:http://localhost:8080}")
    private String serverUrl;

    @Value("${keycloak.realm:myrealm}")
    private String realm;

    @Value("${keycloak.client-id:myclient}")
    private String clientId;

    @Value("${keycloak.client-secret:}")
    private String clientSecret;

    private final RestTemplate restTemplate = new RestTemplate();

    public void registerUser(String email, String password) {
        String adminToken = getAdminToken();

        String usersUrl = serverUrl + "/admin/realms/" + realm + "/users";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(adminToken);

        Map<String, Object> credential = new HashMap<>();
        credential.put("type", "password");
        credential.put("value", password);
        credential.put("temporary", false);

        Map<String, Object> user = new HashMap<>();
        user.put("username", email);
        user.put("email", email);
        user.put("enabled", true);
        user.put("emailVerified", true);
        user.put("credentials", Collections.singletonList(credential));

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(user, headers);

        try {
            restTemplate.postForEntity(usersUrl, request, Void.class);
        } catch (Exception e) {
            System.out.println("Keycloak user registration failed or user already exists: " + e.getMessage());
        }
    }

    private String getAdminToken() {
        String tokenUrl = serverUrl + "/realms/" + realm + "/protocol/openid-connect/token";
        return fetchToken(tokenUrl, "client_credentials", clientId, clientSecret, null, null);
    }

    public String getTokenDirectAccessGrant(String email, String password) {
        String tokenUrl = serverUrl + "/realms/" + realm + "/protocol/openid-connect/token";
        return fetchToken(tokenUrl, "password", clientId, clientSecret, email, password);
    }

    private String fetchToken(String url, String grantType, String clientId, String clientSecret, String username, String password) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", grantType);
        body.add("client_id", clientId);
        if (clientSecret != null && !clientSecret.isEmpty()) body.add("client_secret", clientSecret);
        if (username != null) body.add("username", username);
        if (password != null) body.add("password", password);

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.postForEntity(url, request, Map.class);
        return (String) response.getBody().get("access_token");
    }

    private String getUserIdByEmail(String email, String adminToken) {
        String url = serverUrl + "/admin/realms/" + realm + "/users?email=" + email;
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(adminToken);
        HttpEntity<Void> request = new HttpEntity<>(headers);
        ResponseEntity<Map[]> response = restTemplate.exchange(url, org.springframework.http.HttpMethod.GET, request, Map[].class);
        Map[] users = response.getBody();
        if (users != null && users.length > 0) {
            return (String) users[0].get("id");
        }
        return null;
    }

    private String getGroupIdByName(String groupName, String adminToken) {
        String url = serverUrl + "/admin/realms/" + realm + "/groups?search=" + groupName;
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(adminToken);
        HttpEntity<Void> request = new HttpEntity<>(headers);
        ResponseEntity<Map[]> response = restTemplate.exchange(url, org.springframework.http.HttpMethod.GET, request, Map[].class);
        Map[] groups = response.getBody();
        if (groups != null) {
            for (Map group : groups) {
                if (groupName.equals(group.get("name"))) {
                    return (String) group.get("id");
                }
            }
        }
        return null;
    }

    @PreAuthorize("hasAuthority('admin_main_app')")
    public Boolean assignUserToGroup(String email, String groupName) {
        String adminToken = getAdminToken();
        String userId = getUserIdByEmail(email, adminToken);
        String groupId = getGroupIdByName(groupName, adminToken);

        String url = serverUrl + "/admin/realms/" + realm + "/users/" + userId + "/groups/" + groupId;
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(adminToken);
        HttpEntity<Void> request = new HttpEntity<>(headers);
        try {
            restTemplate.put(url, request);
            return true;
        } catch (Exception e) {
            log.info("Failed to assign user to group: " + e.getMessage());
            return false;
        }
    }

}