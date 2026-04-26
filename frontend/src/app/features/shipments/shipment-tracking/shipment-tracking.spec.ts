import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShipmentTracking } from './shipment-tracking';

describe('ShipmentTracking', () => {
  let component: ShipmentTracking;
  let fixture: ComponentFixture<ShipmentTracking>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShipmentTracking]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShipmentTracking);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
