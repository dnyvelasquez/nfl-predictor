import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Puntajes } from './puntajes';

describe('Puntajes', () => {
  let component: Puntajes;
  let fixture: ComponentFixture<Puntajes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Puntajes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Puntajes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
