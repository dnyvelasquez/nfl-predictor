import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Asignacion } from './asignacion';

describe('Asignacion', () => {
  let component: Asignacion;
  let fixture: ComponentFixture<Asignacion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Asignacion]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Asignacion);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
