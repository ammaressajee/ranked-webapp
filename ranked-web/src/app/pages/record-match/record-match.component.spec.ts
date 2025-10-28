import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordMatchComponent } from './record-match.component';

describe('RecordMatchComponent', () => {
  let component: RecordMatchComponent;
  let fixture: ComponentFixture<RecordMatchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordMatchComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecordMatchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
