package com.example.main_app_server.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Service
public class KafkaMessagingService {

    private static final Logger log = LoggerFactory.getLogger(KafkaMessagingService.class);
    private static final String TOPIC = "main-app-events";

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    // Method for sending/producing messages to the Kafka queue
    public void sendMessage(String message) {
        log.info("Producing message to topic {}: {}", TOPIC, message);
        kafkaTemplate.send(TOPIC, message);
    }

    // Method for subscribing/consuming messages from the Kafka queue
    @KafkaListener(topics = TOPIC, groupId = "${spring.kafka.consumer.group-id:main-app-group}")
    public void consumeMessage(String message) {
        log.info("Consumed message from topic {}: {}", TOPIC, message);
        // Add your event processing logic here
    }
}