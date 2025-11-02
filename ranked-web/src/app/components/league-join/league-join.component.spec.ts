import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeagueJoinComponent } from './league-join.component';

describe('LeagueJoinComponent', () => {
  let component: LeagueJoinComponent;
  let fixture: ComponentFixture<LeagueJoinComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeagueJoinComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeagueJoinComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
