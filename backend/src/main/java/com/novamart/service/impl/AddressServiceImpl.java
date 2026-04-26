package com.novamart.service.impl;

import com.novamart.dto.request.CreateAddressRequest;
import com.novamart.dto.response.AddressResponse;
import com.novamart.entity.Address;
import com.novamart.entity.User;
import com.novamart.repository.AddressRepository;
import com.novamart.repository.UserRepository;
import com.novamart.service.AddressService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AddressServiceImpl implements AddressService {

    private final AddressRepository addressRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public List<AddressResponse> getUserAddresses(Long userId) {
        User user = getUserById(userId);
        return addressRepository.findByUserIdOrderByIsDefaultDescCreatedAtDesc(user.getId()).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public AddressResponse createAddress(Long userId, CreateAddressRequest request) {
        User user = getUserById(userId);
        boolean isFirstAddress = addressRepository.countByUserId(user.getId()) == 0;
        
        Address address = Address.builder()
                .user(user)
                .addressLine(request.getAddressLine())
                .city(request.getCity())
                .district(request.getDistrict())
                .phone(request.getPhone())
                .isDefault(isFirstAddress)
                .build();
                
        Address saved = addressRepository.save(address);
        return mapToResponse(saved);
    }

    @Override
    @Transactional
    public AddressResponse setDefaultAddress(Long userId, Long addressId) {
        User user = getUserById(userId);
        Address address = addressRepository.findByIdAndUserId(addressId, user.getId())
                .orElseThrow(() -> new RuntimeException("Address not found"));

        addressRepository.clearDefaultByUserId(user.getId());
        address.setDefault(true);

        Address saved = addressRepository.save(address);
        return mapToResponse(saved);
    }

    @Override
    @Transactional
    public void deleteAddress(Long userId, Long addressId) {
        User user = getUserById(userId);
        
        Address address = addressRepository.findByIdAndUserId(addressId, user.getId())
                .orElseThrow(() -> new RuntimeException("Address not found"));
        boolean deletedAddressWasDefault = address.isDefault();

        addressRepository.delete(address);

        if (deletedAddressWasDefault) {
            addressRepository.findFirstByUserIdOrderByCreatedAtDesc(user.getId()).ifPresent(nextDefault -> {
                nextDefault.setDefault(true);
                addressRepository.save(nextDefault);
            });
        }
    }
    
    private User getUserById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }
    
    private AddressResponse mapToResponse(Address address) {
        return AddressResponse.builder()
                .id(address.getId())
                .addressLine(address.getAddressLine())
                .city(address.getCity())
                .district(address.getDistrict())
                .phone(address.getPhone())
                .isDefault(address.isDefault())
                .createdAt(address.getCreatedAt())
                .build();
    }
}
