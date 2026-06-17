package vn.edu.hcmuaf.fit.marketplace.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import vn.edu.hcmuaf.fit.marketplace.entity.PublicCodeCounter;
import vn.edu.hcmuaf.fit.marketplace.entity.PublicCodeType;
import vn.edu.hcmuaf.fit.marketplace.repository.PublicCodeCounterRepository;

import java.time.LocalDate;

@Service
public class PublicCodeCounterService {

    private final PublicCodeCounterRepository repository;

    public PublicCodeCounterService(PublicCodeCounterRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long reserve(PublicCodeType type, LocalDate date, long defaultValue) {
        PublicCodeCounter counter = repository.findByCodeTypeAndCodeDate(type, date)
                .orElseGet(() -> newCounter(type, date, defaultValue));
        long nextValue = counter.getLastValue() + 1L;
        counter.setLastValue(nextValue);
        repository.saveAndFlush(counter);
        return nextValue;
    }

    private PublicCodeCounter newCounter(PublicCodeType type, LocalDate date, long defaultValue) {
        PublicCodeCounter counter = new PublicCodeCounter();
        counter.setCodeType(type);
        counter.setCodeDate(date);
        counter.setLastValue(defaultValue);
        return counter;
    }
}
