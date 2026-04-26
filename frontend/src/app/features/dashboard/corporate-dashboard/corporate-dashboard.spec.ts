import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CorporateDashboard } from './corporate-dashboard';

describe('CorporateDashboard', () => {
  let component: CorporateDashboard;
  let fixture: ComponentFixture<CorporateDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CorporateDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CorporateDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
