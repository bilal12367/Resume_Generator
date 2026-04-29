package com.example.main_app_server.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.main_app_server.service.KeycloakService;

@RestController
@RequestMapping("/api/resume")
public class ResumeGeneratorController {

    private static final Logger log = LoggerFactory.getLogger(ResumeGeneratorController.class);

    @Autowired
    private KeycloakService keycloakService;

    @GetMapping("/generate")
    @PreAuthorize("hasAuthority('resume_generator_group')") // Ensures only users with this role can access
    public ResponseEntity<String> generateResume() {
        // In a real application, you would implement the resume generation logic here.
        // For now, we'll return a simple success message.
        log.info("Accessed /api/resume/generate endpoint. User has 'resume_generator_group' role.");
        return ResponseEntity.ok("Resume generated successfully (placeholder).");
    }

    
    @PostMapping("/assign-group")
    public ResponseEntity<String> assignGroup(@RequestParam String email, @RequestParam String groupName) {
        log.info("Received request to assign user {} to group {}", email, groupName);
        try {
            boolean success = keycloakService.assignUserToGroup(email, groupName);
            if (success) {
                log.info("Successfully assigned user {} to group {}", email, groupName);
                return ResponseEntity.ok("User assigned to group successfully.");
            } else {
                log.warn("Failed to assign user {} to group {}", email, groupName);
                return ResponseEntity.badRequest().body("Error: Failed to assign user to group.");
            }
        } catch (Exception e) {
            log.error("Error assigning user {} to group {}: {}", email, groupName, e.getMessage());
            return ResponseEntity.badRequest().body("Error: " + e.getMessage());
        }
    }

    // You can add more endpoints here
}