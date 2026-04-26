import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReviewList } from './review-list';

describe('ReviewList', () => {
  let component: ReviewList;
  let fixture: ComponentFixture<ReviewList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReviewList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
