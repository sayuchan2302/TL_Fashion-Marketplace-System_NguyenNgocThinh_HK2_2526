package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.dto.request.AddressRequest;
import vn.edu.hcmuaf.fit.marketplace.entity.Address;
import vn.edu.hcmuaf.fit.marketplace.entity.User;
import vn.edu.hcmuaf.fit.marketplace.repository.AddressRepository;
import vn.edu.hcmuaf.fit.marketplace.repository.UserRepository;

import java.util.List;
import java.util.UUID;

@Service
public class AddressService {

    private final AddressRepository addressRepository;
    private final UserRepository userRepository;

    public AddressService(AddressRepository addressRepository, UserRepository userRepository) {
        this.addressRepository = addressRepository;
        this.userRepository = userRepository;
    }

    public List<Address> findByUserId(UUID userId) {
        return addressRepository.findByUserIdOrderByIsDefaultDesc(userId);
    }

    public Address findById(UUID id) {
        return addressRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Address not found"));
    }

    @Transactional
    public Address create(UUID userId, AddressRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        boolean hasExistingAddresses = !addressRepository.findByUserIdOrderByIsDefaultDesc(userId).isEmpty();
        boolean shouldSetDefault = !hasExistingAddresses || Boolean.TRUE.equals(request.getIsDefault());

        if (shouldSetDefault && hasExistingAddresses) {
            clearDefaultAddresses(userId);
        }

        Address address = Address.builder()
                .user(user)
                .fullName(request.getFullName())
                .phone(request.getPhone())
                .province(request.getProvince())
                .district(request.getDistrict())
                .ward(request.getWard())
                .detail(request.getDetail())
                .isDefault(shouldSetDefault)
                .label(request.getLabel())
                .ghnProvinceId(request.getGhnProvinceId())
                .ghnDistrictId(request.getGhnDistrictId())
                .ghnWardCode(request.getGhnWardCode())
                .build();

        return addressRepository.save(address);
    }

    @Transactional
    public Address update(UUID addressId, UUID userId, AddressRequest request) {
        Address address = findById(addressId);

        if (!address.getUser().getId().equals(userId)) {
            throw new RuntimeException("Unauthorized");
        }

        if (Boolean.TRUE.equals(request.getIsDefault())) {
            clearDefaultAddresses(userId);
        }

        if (request.getFullName() != null)
            address.setFullName(request.getFullName());
        if (request.getPhone() != null)
            address.setPhone(request.getPhone());
        if (request.getProvince() != null)
            address.setProvince(request.getProvince());
        if (request.getDistrict() != null)
            address.setDistrict(request.getDistrict());
        if (request.getWard() != null)
            address.setWard(request.getWard());
        if (request.getDetail() != null)
            address.setDetail(request.getDetail());
        if (request.getIsDefault() != null)
            address.setIsDefault(request.getIsDefault());
        if (request.getLabel() != null)
            address.setLabel(request.getLabel());
        if (request.getGhnProvinceId() != null)
            address.setGhnProvinceId(request.getGhnProvinceId());
        if (request.getGhnDistrictId() != null)
            address.setGhnDistrictId(request.getGhnDistrictId());
        if (request.getGhnWardCode() != null)
            address.setGhnWardCode(request.getGhnWardCode());

        return addressRepository.save(address);
    }

    @Transactional
    public void delete(UUID addressId, UUID userId) {
        Address address = findById(addressId);

        if (!address.getUser().getId().equals(userId)) {
            throw new RuntimeException("Unauthorized");
        }

        addressRepository.delete(address);
    }

    @Transactional
    public Address setDefault(UUID addressId, UUID userId) {
        clearDefaultAddresses(userId);

        Address address = findById(addressId);
        if (!address.getUser().getId().equals(userId)) {
            throw new RuntimeException("Unauthorized");
        }

        address.setIsDefault(true);
        return addressRepository.save(address);
    }

    private void clearDefaultAddresses(UUID userId) {
        List<Address> defaultAddresses = addressRepository.findByUserIdOrderByIsDefaultDesc(userId)
                .stream()
                .filter(Address::getIsDefault)
                .toList();

        for (Address address : defaultAddresses) {
            address.setIsDefault(false);
            addressRepository.save(address);
        }
    }
}
