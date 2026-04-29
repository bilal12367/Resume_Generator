package com.example.main_app_server.service;

import com.example.main_app_server.entity.User;
import com.example.main_app_server.repository.UserRepository;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;




@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private KeycloakService keycloakService;

    @Value("${mainapp.url}")
    private String main_app_url;

    public void registerUser(String email, String password) throws MessagingException {
        log.info("Attempting to register new user with email: {}", email);
        if (userRepository.findByEmail(email).isPresent()) {
            log.warn("Registration attempt failed for email {}: A user with this email already exists.", email);
            throw new RuntimeException("A user with this email already exists.");
        }

        User user = new User();
        user.setEmail(email);
        // In a real application, password should be hashed before storing!
        user.setPassword(password);
        user.setVerificationToken(UUID.randomUUID().toString());
        user.setEmailVerified(false);

        userRepository.save(user);
        log.info("User {} saved to database with a new verification token.", email);

        log.info("Initiating verification email send for user: {}", email);
        sendVerificationEmail(user);
        
    }

    private void sendVerificationEmail(User user) throws MessagingException {
        log.info("Preparing verification email for user: {}", user.getEmail());
        String verifyUrl = main_app_url + "/api/users/verify?token=" + user.getVerificationToken();

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setTo(user.getEmail());
        helper.setSubject("Verify your email address");

        try {
            // Make sure the filename matches the HTML file in your src/main/resources/ directory
            ClassPathResource resource = new ClassPathResource("templates/user_verification_email_template.html");
            String htmlTemplate = StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8);
            String htmlContent = htmlTemplate.replace("{{VERIFICATION_URL}}", verifyUrl);
            helper.setText(htmlContent, true);

            log.info("Sending verification email to: {}", user.getEmail());
            mailSender.send(message);
            log.info("Verification email successfully sent to: {}", user.getEmail());

        } catch (IOException e) {
            log.error("Failed to read email template for user {}. Error: {}", user.getEmail(), e.getMessage());
            // throw new RuntimeException("Failed to read email template", e);
            log.warn("Executing fallback to send simple message without template.");
            log.info("Sending verification email to: {}", user.getEmail());
            mailSender.send(message);
            log.info("Verification email successfully sent to: {}", user.getEmail());
        }
        
    }

    public String verifyUser(String token) {
        log.info("Attempting to verify user with token: [masked]"); // Mask token for security in logs
        Optional<User> optionalUser = userRepository.findByVerificationToken(token);

        if (optionalUser.isPresent()) {
            User user = optionalUser.get();
            user.setEmailVerified(true);
            user.setVerificationToken(null); // Token is a one-time use
            userRepository.save(user);
            log.info("User with email {} successfully verified. Persisted verification status.", user.getEmail());

            // Register user in Keycloak and retrieve the token via Direct Access Grant
            log.info("Registering user {} with Keycloak.", user.getEmail());
            keycloakService.registerUser(user.getEmail(), user.getPassword());
            String keycloakToken = keycloakService.getTokenDirectAccessGrant(user.getEmail(), user.getPassword());
            log.info("Keycloak access token retrieved for verified user: {}", user.getEmail());
            return keycloakToken;
        } else {
            log.warn("User verification failed: Invalid or expired token received.");
        }
        return null;
    }

    public String loginUser(String email, String password) {
        // log.info("Attempting user login for email: {}", email);
        // Optional<User> optionalUser = userRepository.findByEmail(email);
        // if (optionalUser.isEmpty() || !optionalUser.get().isEmailVerified()) {
        //     log.warn("Login failed: User {} not found or email not verified.", email);
        //     throw new RuntimeException("User not found or email not verified.");
        // }
        // log.info("Local validation successful for user {}. Retrieving Keycloak token from KeycloakService.", email);
        return keycloakService.getTokenDirectAccessGrant(email, password);
    }

}