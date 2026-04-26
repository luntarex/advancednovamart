package com.novamart.service;

import com.novamart.dto.request.CreateAddressRequest;
import com.novamart.dto.response.AddressResponse;

import java.util.List;

public interface AddressService {
    List<AddressResponse> getUserAddresses(Long userId);
    AddressResponse createAddress(Long userId, CreateAddressRequest request);
    AddressResponse setDefaultAddress(Long userId, Long addressId);
    void deleteAddress(Long userId, Long addressId);
}
