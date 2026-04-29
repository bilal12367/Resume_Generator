package com.example.main_app_server.controller;

import com.example.main_app_server.service.KeycloakService;
import com.example.main_app_server.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private static final Logger log = LoggerFactory.getLogger(UserController.class);

    @Autowired
    private UserService userService;

    @Autowired
    private KeycloakService keycloakService;

    @PostMapping("/register")
    public ResponseEntity<String> register(@RequestParam String email, @RequestParam String password) {
        log.info("Received registration request for email: {}", email);
        try {
            userService.registerUser(email, password);
            log.info("Registration request fulfilled successfully for email: {}", email);
            return ResponseEntity.ok("Registration successful. Please check your email to verify your account.");
        } catch (Exception e) {
            log.error("Error processing registration for email {}: {}", email, e.getMessage());
            return ResponseEntity.badRequest().body("Error: " + e.getMessage());
        }
    }

    @GetMapping("/verify")
    public ResponseEntity<String> verify(@RequestParam String token) {
        log.info("Received verification request with token: [masked]"); // Mask token for security in logs
        String keycloakToken = userService.verifyUser(token);
        
        if (keycloakToken != null) {
            log.info("Email verification successful. Setting ACCESS_TOKEN cookie for user.");
            ResponseCookie cookie = ResponseCookie.from("ACCESS_TOKEN", keycloakToken)
                    .httpOnly(true)
                    .path("/")
                    .maxAge(3600) // 1 hour expiration
                    .build();
            
            String html = "<html><body><h2 style='color:green;'>Email verified successfully!</h2><p>You can now close this window and log in to the application.</p></body></html>";
            return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body(html);
        } else {
            log.warn("Email verification failed: Invalid or expired token provided.");
        }
        
        String html = "<html><body><h2 style='color:red;'>Invalid or expired verification link!</h2></body></html>";
        return ResponseEntity.badRequest().body(html);
    }

    @PostMapping("/login")
    public ResponseEntity<String> login(@RequestParam String email, @RequestParam String password) {
        log.info("Received login request for email: {}", email);
        try {
            String token = userService.loginUser(email, password);
            if (token != null) {
                log.info("Login successful for email: {}", email);
                ResponseCookie cookie = ResponseCookie.from("ACCESS_TOKEN", token)
                        .httpOnly(true)
                        .path("/")
                        .maxAge(3600) // 1 hour expiration
                        .build();
                return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, cookie.toString()).body("Login successful");
            }
            log.warn("Failed to obtain access token for email: {}", email);
            return ResponseEntity.badRequest().body("Error: Failed to obtain access token.");
        } catch (Exception e) {
            log.error("Error processing login for email {}: {}", email, e.getMessage());
            return ResponseEntity.badRequest().body("Error: " + e.getMessage());
        }
    }

}