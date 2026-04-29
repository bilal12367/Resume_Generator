package com.example.main_app_server.config;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.server.Cookie;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;


@Configuration
@EnableWebSecurity
@EnableMethodSecurity // prePostEnabled = true is default in Spring Security 6
public class SecurityConfig {

    @Value("${keycloak.server-url}")
    private String keycloakServerUrl;

    @Value("${keycloak.realm}")
    private String keycloakRealm;

    // The Check runs when an endpoint is hit. Cookie check.
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // 1. RE-ENABLE CSRF because you are using Cookies!
            // This requires the frontend to send a 'X-XSRF-TOKEN' header.
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .ignoringRequestMatchers("/api/users/register", "/api/users/login", "/api/users/verify") // Allow public endpoints to skip CSRF
            )
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers("/api/users/register", "/api/users/login", "/api/users/verify").permitAll() 
                .anyRequest().authenticated() 
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .bearerTokenResolver(cookieTokenResolver())
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
            );
        return http.build();
    }

    private BearerTokenResolver cookieTokenResolver() {
        return request -> {
            // Do not attempt to extract tokens for public endpoints.
            // This prevents old, expired cookies from causing a 401 on login/register.
            String path = request.getRequestURI();
            if (path.startsWith("/api/users") || 
                path.startsWith("/api/users/register") || 
                path.startsWith("/api/users/verify")) {
                return null;
            }

            if (request.getCookies() != null) {
                for (jakarta.servlet.http.Cookie cookie : request.getCookies()) {
                    // Ensure this matches the name in your Login Controller exactly
                    if ("ACCESS_TOKEN".equals(cookie.getName())) {
                        return cookie.getValue();
                    }
                }
            }
            return new DefaultBearerTokenResolver().resolve(request);
        };
    }


    /**
     * @PreAuthorize Logic
     * Parses the cookie and extracts jwt token, then converts Keycloak groups to Spring Security roles.
     * Keycloak groups are expected to be in the "groups" claim of the JWT and will be prefixed with "ROLE_" for Spring Security.
     * This allows you to use @PreAuthorize("hasRole('admin')") in your controllers based on Keycloak group membership.
     * @return
     */
    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            // 2. Start with default scopes (e.g., SCOPE_email, SCOPE_profile)
            JwtGrantedAuthoritiesConverter defaultConverter = new JwtGrantedAuthoritiesConverter();
            Collection<GrantedAuthority> authorities = defaultConverter.convert(jwt);

            // 3. Add Keycloak groups as ROLE_
            List<String> groups = jwt.getClaim("groups");
            if (groups != null) {
                authorities.addAll(groups.stream()
                    // .map(group -> new SimpleGrantedAuthority("GROUP_" + group))
                    .map(group -> new SimpleGrantedAuthority(group))
                    .collect(Collectors.toList()));
            }

            return authorities;
        });
        return converter;
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        String jwksUri = String.format("%s/realms/%s/protocol/openid-connect/certs", keycloakServerUrl, keycloakRealm);
        return NimbusJwtDecoder.withJwkSetUri(jwksUri).build();
    }
}