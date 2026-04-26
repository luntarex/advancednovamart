import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoreManagement } from './store-management';

describe('StoreManagement', () => {
  let component: StoreManagement;
  let fixture: ComponentFixture<StoreManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StoreManagement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StoreManagement);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
