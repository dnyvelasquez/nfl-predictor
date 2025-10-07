import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IngresarJuego } from './ingresar-juego';

describe('IngresarJuego', () => {
  let component: IngresarJuego;
  let fixture: ComponentFixture<IngresarJuego>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IngresarJuego]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IngresarJuego);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
