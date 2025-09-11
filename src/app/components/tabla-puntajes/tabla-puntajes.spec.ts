import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TablaPuntajes } from './tabla-puntajes';

describe('TablaPuntajes', () => {
  let component: TablaPuntajes;
  let fixture: ComponentFixture<TablaPuntajes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TablaPuntajes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TablaPuntajes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
