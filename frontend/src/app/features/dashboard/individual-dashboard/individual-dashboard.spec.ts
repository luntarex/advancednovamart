import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IndividualDashboard } from './individual-dashboard';

describe('IndividualDashboard', () => {
  let component: IndividualDashboard;
  let fixture: ComponentFixture<IndividualDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IndividualDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IndividualDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
