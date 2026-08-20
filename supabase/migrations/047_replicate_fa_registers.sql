-- ============================================================
-- Migration 047: Replicate the fixed-asset registers from the source files
--
-- The register is now built to match the "FA ( WP) 2026" sheet of each
-- branch's workbook exactly -- that sheet is the working paper the
-- accounts are actually prepared from, so it is the register of record.
-- Every row's category, quantity, unit/total value, useful life and
-- depreciable flag is taken straight from that sheet.
--
-- Resulting totals, equal to each sheet's own Sub-Total row:
--   Kampot      $826,166.08  (104 rows)
--   Srae Ambel  $247,355.61  ( 66 rows)
--
-- Rows the workbooks do not carry are removed. These are the low-value
-- items the sheets leave out of the capitalised register -- linen and
-- towels, bulbs and solar lamps, hand tools, fire extinguishers, trays,
-- kayaks and life jackets. The workbooks remain the source of record for
-- them, and the Kampot file keeps them on its own separate
-- "Other_ 5-7 Origina File (Exp)" (expensed) sheet.
--
-- Rows already present keep their id, so audit history, location and
-- in-charge notes carry over; only the figures are restated.
-- ============================================================

-- ─── KAMPOT ───────────────────────────────────────────
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=0, total_cost=359204.99, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='52db631f-2675-4087-bb28-a5bae5aa7f66';
UPDATE fixed_assets SET category='building', quantity=2, unit_cost=0, total_cost=5900, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='eb4a2669-7fbe-47f5-85b6-be57893c3421';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=0, total_cost=1695, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='03bc34b6-fe03-4c76-8efc-8911142306e1';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=0, total_cost=521, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='1052a40d-33f1-45cb-97f4-221f5aa08627';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=0, total_cost=7845.95, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='e5230d64-bf04-4d37-9b18-a2c647df124b';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=350, total_cost=350, useful_life_months=48, is_depreciable=true, purchased_date='2025-12-25', updated_at=NOW() WHERE id='305971b7-4da5-46f9-a596-33c09e740d5f';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=450, total_cost=450, useful_life_months=48, is_depreciable=true, purchased_date='2025-12-25', updated_at=NOW() WHERE id='b8d979fb-f77e-46a6-a0da-e26cd538be54';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=26, total_cost=52, useful_life_months=48, is_depreciable=true, purchased_date='2026-02-09', updated_at=NOW() WHERE id='8a0f7122-f9ca-4e7c-bf3b-aa0c0ad33aa9';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=755, useful_life_months=48, is_depreciable=true, purchased_date='2026-03-25', updated_at=NOW() WHERE id='85e19b10-f82d-48b9-9e93-d55b0b79b331';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=230, total_cost=230, useful_life_months=48, is_depreciable=true, purchased_date='2026-04-11', updated_at=NOW() WHERE id='1bb746b6-aba1-49d0-86df-41a8165e6266';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=440, total_cost=440, useful_life_months=48, is_depreciable=true, purchased_date='2026-04-11', updated_at=NOW() WHERE id='2cca3939-3220-47a6-8b35-bf797f99febe';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=88, total_cost=88, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-12', updated_at=NOW() WHERE id='5c728f91-68e6-4bd5-8629-e52172ad7d20';
UPDATE fixed_assets SET category='furniture_fixture', quantity=8, unit_cost=88, total_cost=704, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-13', updated_at=NOW() WHERE id='90de1f5a-f73f-4cfb-b5f0-2378ea957d1e';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=260, total_cost=260, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-13', updated_at=NOW() WHERE id='d9c9b841-0ac7-4a37-b943-5c85f568b408';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=33, total_cost=66, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-13', updated_at=NOW() WHERE id='0e6eb62a-2cda-4e59-b08e-e3e96e3a83fc';
UPDATE fixed_assets SET category='furniture_fixture', quantity=20, unit_cost=16.5, total_cost=330, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-13', updated_at=NOW() WHERE id='60202b77-ad19-450d-be40-b677472d6906';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=175, total_cost=350, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-14', updated_at=NOW() WHERE id='50b5f430-5a05-406d-8130-286b69cd43e3';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=75, total_cost=150, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-15', updated_at=NOW() WHERE id='b74f710a-dc3c-43c4-b671-714b5c2af308';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=130, total_cost=130, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-19', updated_at=NOW() WHERE id='0651ad09-97b0-4983-9daf-38c84f336ad6';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=14, total_cost=28, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-19', updated_at=NOW() WHERE id='3b662bcc-0057-443c-a65c-a20eed71b9bc';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=1800, total_cost=1800, useful_life_months=48, is_depreciable=true, purchased_date='2026-06-06', updated_at=NOW() WHERE id='7d5c0169-41a3-4073-89ff-125a15bc7bfe';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=580, total_cost=1160, useful_life_months=48, is_depreciable=true, purchased_date='2026-06-08', updated_at=NOW() WHERE id='f46d448f-97f4-4024-b240-7fd08eba8f6a';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=1783, total_cost=1783, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='36e5e2d0-6571-455b-a8a8-4607098e200c';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=330, total_cost=330, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='eb023582-31df-4918-b954-c4c62b4bcfa1';
UPDATE fixed_assets SET category='furniture_fixture', quantity=10, unit_cost=159.33, total_cost=1593.3, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='67c48973-ff38-4c99-b89c-d8aa6b06d3e8';
UPDATE fixed_assets SET category='furniture_fixture', quantity=10, unit_cost=167.33, total_cost=1673.3, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='b1ac76b0-74a6-4145-ab90-97dc0d0b9b71';
UPDATE fixed_assets SET category='furniture_fixture', quantity=10, unit_cost=167.33, total_cost=1673.3, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='7daf4dbd-24e8-489a-b200-f73d76e38435';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=342.65, total_cost=342.65, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-08', updated_at=NOW() WHERE id='160a4d50-56fe-4002-9d61-f90ef837073f';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=347.24, total_cost=347.24, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-08', updated_at=NOW() WHERE id='2bd8d556-32d6-4293-8837-916eae4588c8';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=351.83, total_cost=351.83, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-08', updated_at=NOW() WHERE id='fc5fc14f-126d-4582-85aa-02ac92ec7591';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=451.26, total_cost=451.26, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-08', updated_at=NOW() WHERE id='468e7fa6-6af5-4a2c-94f0-28c283d66a15';
UPDATE fixed_assets SET category='furniture_fixture', quantity=4, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='927d43ac-ee7a-40ec-90a5-300a4e272337';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='76d2c7cc-6ade-4b5e-87d6-37ff8244ef2f';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='dfefaee9-0252-49c8-88bf-be86904a5987';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=385, total_cost=385, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-08', updated_at=NOW() WHERE id='dc490935-d0a1-44e1-866a-88b2d70e6393';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=390.02, total_cost=390.02, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-08', updated_at=NOW() WHERE id='b17f0855-494b-4607-88d5-a68652101ac6';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=2088, total_cost=2088, useful_life_months=48, is_depreciable=true, purchased_date='2026-02-03', updated_at=NOW() WHERE id='12dd7cfd-5dc9-4ae6-877f-341afcd53a17';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=1050, total_cost=1050, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-15', updated_at=NOW() WHERE id='21a76348-c5d6-4ea4-9ecd-344f3fbc3392';
UPDATE fixed_assets SET category='furniture_fixture', quantity=4, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='a19ee76d-cd21-4c39-bedc-d2dc930a0f14';
UPDATE fixed_assets SET category='furniture_fixture', quantity=30, unit_cost=6.5, total_cost=195, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='7bfbcd7e-be9e-473c-8f5f-b0ce20a5815f';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='425310a8-c9c7-41e1-b340-b0af1ed26311';
UPDATE fixed_assets SET category='furniture_fixture', quantity=3, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='3f85dccb-72c4-4aeb-a509-d94ba765a61d';
UPDATE fixed_assets SET category='furniture_fixture', quantity=4, unit_cost=27.05, total_cost=108.2, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='8deb6804-adae-4c52-88df-b294238915a7';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=110.45, total_cost=220.9, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='a48e497f-1a2c-48bb-aa2a-bfb8896c30c2';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=60, total_cost=60, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='c6fdcbd6-6085-43c8-8593-4dd3b1f982a1';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='97b2f7ec-066d-45a7-b474-cb8b400fbbe5';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=650, total_cost=650, useful_life_months=48, is_depreciable=true, purchased_date='2026-06-02', updated_at=NOW() WHERE id='dd99db6f-46ec-4e6f-8d1e-f8c44dd26f6d';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=111.5, total_cost=111.5, useful_life_months=48, is_depreciable=true, purchased_date='2026-04-09', updated_at=NOW() WHERE id='16c1b46d-fc8c-49ef-9804-a9a6442d712c';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=1035, total_cost=1035, useful_life_months=48, is_depreciable=true, purchased_date='2026-04-30', updated_at=NOW() WHERE id='725fb2a2-39ff-4ec5-8c0e-967a5bcac967';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=170, total_cost=170, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-12', updated_at=NOW() WHERE id='a76331e8-a104-423e-bc07-d0db2cfec68c';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=75, total_cost=75, useful_life_months=48, is_depreciable=true, purchased_date='2024-10-09', updated_at=NOW() WHERE id='58ecc559-e7b3-4746-9518-a3f50493fc24';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=775, total_cost=775, useful_life_months=48, is_depreciable=true, purchased_date='2024-12-30', updated_at=NOW() WHERE id='53352e3a-ae5a-42a9-9583-cf3701f46186';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=100, total_cost=100, useful_life_months=48, is_depreciable=true, purchased_date='2024-12-30', updated_at=NOW() WHERE id='a13e092a-fe55-4eef-abef-297867c57cdb';
UPDATE fixed_assets SET category='furniture_fixture', quantity=4, unit_cost=645, total_cost=2580, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-05', updated_at=NOW() WHERE id='bb0cce9e-dd0e-43e2-9b2d-ef768f4354bd';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=910, total_cost=910, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-05', updated_at=NOW() WHERE id='b96a1519-3c8e-4627-844a-66668ad00bb5';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=1420, total_cost=2840, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-05', updated_at=NOW() WHERE id='121886f8-c2ea-48f0-834d-8b2450a71246';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='ea1cd5cb-11af-4c4b-85c5-240505161cca';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='bf1dc132-7e4c-4884-9a78-3793cea4e7fe';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=150, total_cost=150, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='4261520b-924a-4f71-b021-86d2d3d65e34';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='93e6a6e5-1002-496a-adf5-a76bd34191fb';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='edc5a644-a02b-4480-9ef7-a22d8498fe2b';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='dda92126-2292-4777-be76-f7dbefc00929';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='49a75dc6-7b3a-4562-84ae-c51a607e6ab2';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=8940, useful_life_months=48, is_depreciable=true, purchased_date='2024-07-01', updated_at=NOW() WHERE id='021513d6-0180-4653-92a8-276b20b2a651';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=340, useful_life_months=48, is_depreciable=true, purchased_date='2024-08-20', updated_at=NOW() WHERE id='65468778-7a47-4194-82df-e589460a29aa';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=330, useful_life_months=48, is_depreciable=true, purchased_date='2024-08-20', updated_at=NOW() WHERE id='b779b9eb-0dcc-4810-882b-6433e782c9e9';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=330, useful_life_months=48, is_depreciable=true, purchased_date='2024-08-20', updated_at=NOW() WHERE id='a9911ca9-8bed-4fae-99ec-2ae826753c80';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=6, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date='2024-08-20', updated_at=NOW() WHERE id='c868c8ef-89c7-4441-8eb8-128de059f368';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=2800, useful_life_months=48, is_depreciable=true, purchased_date='2026-06-04', updated_at=NOW() WHERE id='965ff983-5b74-4f74-9142-ee0185e8e2fe';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=2300, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-22', updated_at=NOW() WHERE id='d56da25d-3eb2-44d6-a5b1-34b5433e371e';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=1890, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='12727b14-6444-4ba8-bc49-34b90be0f2bc';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='72fd8e3a-c711-49fa-938c-a8d77358c304';
UPDATE fixed_assets SET category='kitchen_equipment', quantity=1, unit_cost=0, total_cost=60, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-12', updated_at=NOW() WHERE id='83fe5555-3f5b-49b2-a008-0fc99916a3d8';
UPDATE fixed_assets SET category='kitchen_equipment', quantity=1, unit_cost=0, total_cost=110, useful_life_months=48, is_depreciable=true, purchased_date='2026-06-08', updated_at=NOW() WHERE id='15326812-4d77-4419-924f-f8f0255ab032';
UPDATE fixed_assets SET category='kitchen_equipment', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='ffe27c47-e9d5-48a7-aa0b-1ef6b4259f39';
UPDATE fixed_assets SET category='kitchen_equipment', quantity=2, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='5a84b2f4-3c1e-49e0-8d12-74e5b24d4212';
UPDATE fixed_assets SET category='kitchen_equipment', quantity=2, unit_cost=17, total_cost=34, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='54e3c490-ff28-4e4c-a824-13ed656c95f5';
UPDATE fixed_assets SET category='kitchen_equipment', quantity=2, unit_cost=14, total_cost=28, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='a01d8f10-9a34-4848-9283-cd3c3c354475';
UPDATE fixed_assets SET category='kitchen_equipment', quantity=2, unit_cost=10, total_cost=20, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='66e46d60-2d41-4e41-a343-4c5afcdce1c7';
UPDATE fixed_assets SET category='operating_linen', quantity=1, unit_cost=169, total_cost=169, useful_life_months=84, is_depreciable=true, purchased_date='2026-04-06', updated_at=NOW() WHERE id='9160d2b3-7858-42dc-bc76-5984d03e108d';
UPDATE fixed_assets SET category='operating_linen', quantity=1, unit_cost=35, total_cost=35, useful_life_months=60, is_depreciable=true, purchased_date='2026-04-11', updated_at=NOW() WHERE id='3f244f71-1810-4ae3-98d1-fa68585ff05a';
UPDATE fixed_assets SET category='operating_linen', quantity=4, unit_cost=46, total_cost=184, useful_life_months=60, is_depreciable=true, purchased_date='2026-04-11', updated_at=NOW() WHERE id='49ff8a72-2468-4f90-b1f9-1faa440efccb';
UPDATE fixed_assets SET category='operating_linen', quantity=10, unit_cost=4, total_cost=40, useful_life_months=24, is_depreciable=true, purchased_date='2026-04-11', updated_at=NOW() WHERE id='f4b24192-8972-4000-8cdb-c9c80de47ab2';
UPDATE fixed_assets SET category='operating_linen', quantity=5, unit_cost=46, total_cost=230, useful_life_months=60, is_depreciable=true, purchased_date='2026-04-11', updated_at=NOW() WHERE id='2e53f122-5a16-4fe7-9d07-d276f203de3e';
UPDATE fixed_assets SET category='operating_linen', quantity=4, unit_cost=320, total_cost=1280, useful_life_months=84, is_depreciable=true, purchased_date='2026-05-05', updated_at=NOW() WHERE id='f3193427-3668-4438-9d83-49bc091c995a';
UPDATE fixed_assets SET category='operating_linen', quantity=8, unit_cost=0, total_cost=0, useful_life_months=24, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='fb7edb6d-aff4-4686-b2ec-584b274398e0';
UPDATE fixed_assets SET category='operating_linen', quantity=1, unit_cost=46, total_cost=46, useful_life_months=24, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='2a9ac3f4-d62e-430d-b3fd-9e75f3b066e3';
UPDATE fixed_assets SET category='operating_linen', quantity=20, unit_cost=7.5, total_cost=150, useful_life_months=24, is_depreciable=true, purchased_date='2026-05-12', updated_at=NOW() WHERE id='8794d3c7-db8d-4887-a1fd-39e6a8aed5cc';
UPDATE fixed_assets SET category='operating_linen', quantity=20, unit_cost=3.5, total_cost=70, useful_life_months=24, is_depreciable=true, purchased_date='2026-05-12', updated_at=NOW() WHERE id='462b390f-e969-4a09-958f-2067e85a9559';
UPDATE fixed_assets SET category='operating_linen', quantity=10, unit_cost=7, total_cost=70, useful_life_months=24, is_depreciable=true, purchased_date='2026-05-12', updated_at=NOW() WHERE id='95573ed5-e397-4ae9-9b9a-9035fc8b068f';
UPDATE fixed_assets SET category='operating_linen', quantity=10, unit_cost=10, total_cost=100, useful_life_months=24, is_depreciable=true, purchased_date='2026-05-12', updated_at=NOW() WHERE id='46d3c055-c04d-4d4b-9acc-9e24d3ce5735';
UPDATE fixed_assets SET category='operating_linen', quantity=4, unit_cost=19, total_cost=76, useful_life_months=24, is_depreciable=true, purchased_date='2026-06-09', updated_at=NOW() WHERE id='ff241daf-9d33-44bb-be0a-63e554bffbd0';
UPDATE fixed_assets SET category='operating_linen', quantity=1, unit_cost=17, total_cost=17, useful_life_months=24, is_depreciable=true, purchased_date='2026-06-09', updated_at=NOW() WHERE id='55eeac2b-3ef5-47fe-878f-820df7cee495';
UPDATE fixed_assets SET category='operating_linen', quantity=10, unit_cost=23.5, total_cost=235, useful_life_months=60, is_depreciable=true, purchased_date='2026-06-09', updated_at=NOW() WHERE id='7b690d9e-d275-4227-bc9f-f62e2a3a4fd6';
UPDATE fixed_assets SET category='operating_linen', quantity=5, unit_cost=40.5, total_cost=202.5, useful_life_months=24, is_depreciable=true, purchased_date='2026-06-09', updated_at=NOW() WHERE id='84cbe277-5704-456f-8fc0-dac328448a9b';
UPDATE fixed_assets SET category='operating_linen', quantity=5, unit_cost=34.25, total_cost=171.25, useful_life_months=24, is_depreciable=true, purchased_date='2026-06-09', updated_at=NOW() WHERE id='06f53691-6300-4072-a979-36f31d3d7724';
UPDATE fixed_assets SET category='operating_linen', quantity=20, unit_cost=6.5, total_cost=130, useful_life_months=24, is_depreciable=true, purchased_date='2026-06-09', updated_at=NOW() WHERE id='d621d95f-1a3b-4e2c-926b-6d8b6161ba83';
UPDATE fixed_assets SET category='operating_linen', quantity=20, unit_cost=3.75, total_cost=75, useful_life_months=24, is_depreciable=true, purchased_date='2026-06-09', updated_at=NOW() WHERE id='450cbc8e-5c03-4add-bc45-f10da35dbc4f';
UPDATE fixed_assets SET category='land', quantity=1, unit_cost=0, total_cost=345000, useful_life_months=NULL, is_depreciable=false, purchased_date=NULL, updated_at=NOW() WHERE id='954251e0-ad23-4c78-b162-9e39d93ad687';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=0, total_cost=35426.89, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='58637760-bd63-49c4-a561-a901151dfbf4';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=0, total_cost=3390, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='37dca253-cfe8-452b-afe1-9ee91e666ccf';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=0, total_cost=2937, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='87c2f727-6dac-453c-80e0-0da419884626';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=2, unit_cost=0, total_cost=14000, useful_life_months=48, is_depreciable=true, purchased_date='2024-07-03', updated_at=NOW() WHERE id='f5dd2d9d-eb6c-4be5-8ea9-c1ab05af65ff';
INSERT INTO fixed_assets (description, category, quantity, unit_cost, total_cost, useful_life_months, is_depreciable, purchased_date, asset_code, invoice_doc_ref, status, branch_id) VALUES ('ម៉ាស៊ីនកាហ្វេ Philip', 'kitchen_equipment', 1, 0, 0, 48, true, NULL, NULL, NULL, 'active', 'c9f2b971-d2ea-421c-bb80-c5692ea9c60b');
DELETE FROM fixed_assets WHERE id IN (
  'c06f5137-49c3-44a9-9c27-f0e6c39eb183',
  'acc5e5fb-b4a7-4b44-a715-6f033f6a4cff',
  'e51b4560-19d7-4b8b-9126-e56a8dbdee38',
  'a4c9c02c-37d0-4faf-9c03-fdbee28dd8d9',
  'd58effcc-b9a0-4630-963f-53a2a0f73566',
  '4c05e006-3495-4617-95f4-cf8ac53ccfd9',
  'fad32fb1-6ba1-4425-9da4-ca0034b97365',
  '83c26501-f026-4e1a-ad93-bdf7c5de5879',
  'e1244eb7-f808-450d-87af-596d251fe6bd',
  '24a6c64e-cf9e-4d3b-a276-bf2b12343a80',
  'aef8e6a7-b872-491a-b591-1b8acd743def',
  '5b58efa8-feb2-4202-88be-212d1cdcc6d7',
  '26306532-9ff9-4acc-964e-a4cb71c2690d',
  '3b513d38-7cf3-46db-9a3a-9a026c23cfb3',
  '4afec001-8e49-44cd-a9ab-86dd07fdab4b',
  '5a9a6204-f940-41da-941f-962e45ae7514',
  '44f400c7-2b34-4cc4-91ed-8b8fcaa54831',
  'a6ae3f92-28cc-4280-9f72-32def0fe9b25',
  '5ea93707-7624-4b22-bfb8-6222043287ca',
  '6ef859c8-5074-404d-85ed-cd5967431528',
  'f53d411b-d81e-4d95-8a96-3ad860cb5c74',
  '9b15973d-2c8e-4fb8-ab3e-70c197fbe16a',
  'db34d07a-ee5c-42ba-9887-cb8fa27ed15e',
  '2324a38a-d5ed-433c-9dca-df19851b92d0',
  '09d2629a-825e-4f49-90d8-3540d78c5b0a',
  '34586644-e58d-453d-b49b-f00df59e3d4a',
  '53259c8e-dc06-4584-80e7-bbb8197f313f',
  '4bbd52e6-87cb-4528-abdc-68a06aa280e8',
  'a0505d23-4f98-445b-bdf3-94fa5101dff1',
  '876b347b-1a82-4d8c-9528-9cd0da656156',
  '1b979e77-198e-4938-9328-46be40168bf9',
  'c3299482-3a17-477a-8c3a-3b768169d42e',
  'd246fc95-948a-42b0-a3e1-a8f41da04430',
  '6941ac7d-b577-4d5e-80e8-7251cfedd610',
  '9f5b9a07-eadc-46c7-b0a5-6880cbdcbc97',
  '4d1d4dd8-293e-4380-86ea-61346b2aeff9',
  '0b7c0687-b5db-49bb-a3c0-cdc4a488c182',
  'c5297c64-697d-4a99-ae39-221e2ae3b7ee',
  '1e24e174-57e4-472d-a349-eae99f226558',
  'be2a4b92-beee-401b-a9ea-801eb876ba8a',
  'ad74ab6f-6dca-477f-b320-e7009dec4909',
  '97c4f552-7e1d-4755-9c42-347622abba97',
  'ff481d40-8110-41dd-96d7-d9d19d85f8d4',
  '2461a2f7-6936-4dda-887c-a9b6e715f0d6',
  'd7d5f83f-3fdb-498b-9714-4c4a4084d347',
  '133046f6-ce84-4896-aadb-f3ee4be0ea4b'
);

-- ─── SRAE ───────────────────────────────────────────
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=750, total_cost=750, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='85b103f1-6bf8-4376-b777-530db939332b';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=147697.51, total_cost=147697.51, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='0e6bc02d-bd38-43a4-a399-8a5790d6a175';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=9558.5, total_cost=9558.5, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='7fac61bf-69f9-4dfa-a890-50f2d1499e50';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=7302, total_cost=7302, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='ac470c4f-4817-4e80-bd03-b2fa88865304';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=6355.69, total_cost=6355.69, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='497979bd-392b-4633-8e68-eceebbc7f0b7';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=371.96, total_cost=371.96, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='a7748666-4561-4c7f-b7d1-e1c329bf396b';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=16915, total_cost=16915, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='e6575935-bef5-4840-b88c-efeeb9c0c30c';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=1500, total_cost=1500, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='7d6af3d6-fb2d-4428-8d84-dfbdad67f241';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=10250.5, total_cost=10250.5, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='22157a68-f257-4617-af6a-27429697ded8';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=2650, total_cost=2650, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='7ca7479b-5298-4c44-8afd-3c60efccb3d7';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=2200, total_cost=2200, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='36160e6b-5bda-4340-8dec-f36ff46dfab1';
UPDATE fixed_assets SET category='building', quantity=1, unit_cost=4490, total_cost=4490, useful_life_months=240, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='d57bc0bd-4970-43d2-9a4b-837ca8ada1b8';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=75, total_cost=75, useful_life_months=48, is_depreciable=true, purchased_date='2026-03-10', updated_at=NOW() WHERE id='2d28ca9c-22e5-4e64-b2d3-572c71f386a9';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=65, total_cost=65, useful_life_months=48, is_depreciable=true, purchased_date='2026-06-06', updated_at=NOW() WHERE id='e9865311-881b-4e60-a19d-debc42866c51';
UPDATE fixed_assets SET category='furniture_fixture', quantity=3, unit_cost=55, total_cost=165, useful_life_months=48, is_depreciable=true, purchased_date='2026-06-06', updated_at=NOW() WHERE id='f044d064-6920-48f9-985e-3be8cc769afc';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=25, total_cost=25, useful_life_months=48, is_depreciable=true, purchased_date='2026-06-06', updated_at=NOW() WHERE id='3e51d5d0-93b4-4a71-b2f7-35481721cb73';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=355, total_cost=355, useful_life_months=48, is_depreciable=true, purchased_date='2025-06-10', updated_at=NOW() WHERE id='b56c706e-fdb8-4ce4-a947-9ee39989ef2e';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=90, total_cost=90, useful_life_months=48, is_depreciable=true, purchased_date='2025-06-10', updated_at=NOW() WHERE id='5e94bd24-cb9a-4692-9049-55add4be36ba';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=995.5, total_cost=995.5, useful_life_months=48, is_depreciable=true, purchased_date='2025-10-17', updated_at=NOW() WHERE id='49abb9e7-02ed-43fe-9e3b-0be976999ec7';
UPDATE fixed_assets SET category='furniture_fixture', quantity=5, unit_cost=28, total_cost=140, useful_life_months=48, is_depreciable=true, purchased_date='2025-06-10', updated_at=NOW() WHERE id='faebc714-2fd2-4b63-988d-b57841f3e093';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=28, total_cost=28, useful_life_months=48, is_depreciable=true, purchased_date='2025-06-10', updated_at=NOW() WHERE id='cedc2da0-bc5b-410c-a58d-5229d43c6091';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=95, total_cost=95, useful_life_months=48, is_depreciable=true, purchased_date='2025-07-10', updated_at=NOW() WHERE id='aeed6cb3-b4d0-4280-a01c-4bf411a0cb29';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=60, total_cost=60, useful_life_months=48, is_depreciable=true, purchased_date='2025-07-10', updated_at=NOW() WHERE id='1a540846-885d-4f20-8a31-3529b5688afe';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=25, total_cost=25, useful_life_months=48, is_depreciable=true, purchased_date='2025-07-10', updated_at=NOW() WHERE id='f9c73ec5-391e-4065-ba9d-18ca86f35e4f';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=440, total_cost=440, useful_life_months=48, is_depreciable=true, purchased_date='2025-07-29', updated_at=NOW() WHERE id='98d0df27-d707-46e2-a3e3-2871279415f0';
UPDATE fixed_assets SET category='furniture_fixture', quantity=4, unit_cost=95, total_cost=380, useful_life_months=48, is_depreciable=true, purchased_date='2025-07-29', updated_at=NOW() WHERE id='1b4e3539-76d7-478c-b1fb-ebd79325511f';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=45, total_cost=45, useful_life_months=48, is_depreciable=true, purchased_date='2025-07-29', updated_at=NOW() WHERE id='6a1f48d4-1dba-4aad-aec6-96ad3cc7f443';
UPDATE fixed_assets SET category='furniture_fixture', quantity=10, unit_cost=35, total_cost=350, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-01', updated_at=NOW() WHERE id='9b73420b-2814-4302-b38f-41a5e8e90e9e';
UPDATE fixed_assets SET category='furniture_fixture', quantity=3, unit_cost=65, total_cost=195, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-19', updated_at=NOW() WHERE id='fb67270a-6693-4ef2-987b-dd1bc54df576';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=25, total_cost=50, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-19', updated_at=NOW() WHERE id='dd61f244-4487-4fe6-b969-9e565d2c91bf';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=20, total_cost=40, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-19', updated_at=NOW() WHERE id='60a99114-fb6d-443b-82f4-b1e17b034483';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=25, total_cost=25, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-19', updated_at=NOW() WHERE id='2f82ddfb-52b5-4ec2-b6f8-af498c74985b';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=600, total_cost=600, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-20', updated_at=NOW() WHERE id='b92e7a7b-3089-452d-9676-312a9daa9f83';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=370, total_cost=740, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-27', updated_at=NOW() WHERE id='0627afed-1741-48e5-9dc7-48720d991686';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=80, total_cost=160, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-30', updated_at=NOW() WHERE id='6e05f1c4-c49e-4cc4-8cee-572a64439fda';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=375, total_cost=375, useful_life_months=48, is_depreciable=true, purchased_date='2025-09-09', updated_at=NOW() WHERE id='f2c4662d-c0f5-4e01-aaeb-6627a765a3e8';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=65, total_cost=65, useful_life_months=48, is_depreciable=true, purchased_date='2025-09-12', updated_at=NOW() WHERE id='7570e39b-f162-49c5-abb1-ac08d917096f';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=55, total_cost=55, useful_life_months=48, is_depreciable=true, purchased_date='2025-10-07', updated_at=NOW() WHERE id='6fd14441-fbea-465e-8b04-0cd4e244ee87';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=165, total_cost=165, useful_life_months=48, is_depreciable=true, purchased_date='2025-10-07', updated_at=NOW() WHERE id='744fc131-5628-41d4-86c9-4faaecdd5857';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=55, total_cost=55, useful_life_months=48, is_depreciable=true, purchased_date='2025-10-07', updated_at=NOW() WHERE id='be517488-054d-4429-baa0-d55d7817d6dd';
UPDATE fixed_assets SET category='furniture_fixture', quantity=12, unit_cost=22, total_cost=264, useful_life_months=48, is_depreciable=true, purchased_date='2025-11-18', updated_at=NOW() WHERE id='ba857d73-d189-4e8f-958a-dabde402fa5a';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=15, total_cost=30, useful_life_months=48, is_depreciable=true, purchased_date='2026-04-22', updated_at=NOW() WHERE id='2189c4b7-4a51-4a7c-b5f5-02ec7d83fab6';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=90, total_cost=180, useful_life_months=48, is_depreciable=true, purchased_date='2025-10-15', updated_at=NOW() WHERE id='0e832969-f648-4c66-be68-9795f43626df';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='1555ab70-1444-43e2-b4fb-5a9bd825f791';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='8e9965f8-7fa7-4d98-a793-3deb868c2cc1';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=480, total_cost=480, useful_life_months=48, is_depreciable=true, purchased_date='2025-05-07', updated_at=NOW() WHERE id='2db2b464-9278-4e69-8c5b-912f20f82a72';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=300, total_cost=300, useful_life_months=48, is_depreciable=true, purchased_date='2025-05-24', updated_at=NOW() WHERE id='f05c1591-ab50-49c8-874e-5e8759f7dc8b';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=650, total_cost=650, useful_life_months=48, is_depreciable=true, purchased_date='2025-07-04', updated_at=NOW() WHERE id='28d7763b-d630-4a45-a633-1ca5ed39aabc';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=119.63, total_cost=119.63, useful_life_months=48, is_depreciable=true, purchased_date='2025-08-11', updated_at=NOW() WHERE id='1c643f65-e986-4777-b0c2-238c33e88d10';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=140, total_cost=140, useful_life_months=48, is_depreciable=true, purchased_date='2025-09-01', updated_at=NOW() WHERE id='1a932682-5f48-4d3a-800d-98b0f3258a7b';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=36, total_cost=36, useful_life_months=48, is_depreciable=true, purchased_date='2025-09-01', updated_at=NOW() WHERE id='b2540f1c-82f4-4f8f-9819-c7b853b4be1f';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=366.53, total_cost=366.53, useful_life_months=48, is_depreciable=true, purchased_date='2025-11-20', updated_at=NOW() WHERE id='ed92a4e0-7510-4f73-9014-3be2ff0f26e0';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=69.79, total_cost=69.79, useful_life_months=48, is_depreciable=true, purchased_date='2026-01-26', updated_at=NOW() WHERE id='1481f66e-5f1b-4660-8281-90da6bbfa348';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=520, total_cost=520, useful_life_months=48, is_depreciable=true, purchased_date='2025-01-25', updated_at=NOW() WHERE id='60bbd721-df11-451e-8147-e15fa6666cb7';
UPDATE fixed_assets SET category='furniture_fixture', quantity=2, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='8dd1a460-f29a-429b-bfb1-fcc77b491266';
UPDATE fixed_assets SET category='furniture_fixture', quantity=3, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='533b2494-f908-428a-bcfb-486681a68e14';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='c5774130-a036-40c1-aa92-54ce907a783e';
UPDATE fixed_assets SET category='furniture_fixture', quantity=8, unit_cost=125.62, total_cost=1005, useful_life_months=48, is_depreciable=true, purchased_date='2025-01-15', updated_at=NOW() WHERE id='c9f6b09e-32e9-4d38-a28f-0c7cb43144f0';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=8000, total_cost=8000, useful_life_months=48, is_depreciable=true, purchased_date='2026-07-15', updated_at=NOW() WHERE id='1f6bcf82-47c6-48e0-8e75-0e555ac411dc';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=16000, total_cost=16000, useful_life_months=48, is_depreciable=true, purchased_date='2026-07-24', updated_at=NOW() WHERE id='b7cf0bbf-0863-4695-95ca-14e6dc710dd3';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=3200, total_cost=3200, useful_life_months=48, is_depreciable=true, purchased_date='2026-05-09', updated_at=NOW() WHERE id='043049ba-9941-44ec-af21-2ff8dbd79091';
UPDATE fixed_assets SET category='machinery_vehicle', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='ad0806c5-ff0b-4f36-8328-75c0378900bb';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='963118e9-62f5-4949-b3bd-e2f62d4ee8fd';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=95, total_cost=95, useful_life_months=48, is_depreciable=true, purchased_date='2025-07-29', updated_at=NOW() WHERE id='62a6387b-b1c8-437b-b436-7fe5e94a9fd9';
UPDATE fixed_assets SET category='furniture_fixture', quantity=3, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='cdfb4653-20e0-4688-b1f8-122601f1f2d7';
UPDATE fixed_assets SET category='furniture_fixture', quantity=1, unit_cost=0, total_cost=0, useful_life_months=48, is_depreciable=true, purchased_date=NULL, updated_at=NOW() WHERE id='339339af-74fb-498c-9bfe-45712bcc51b2';
DELETE FROM fixed_assets WHERE id IN (
  'd3ef8725-e951-49cb-9d6d-da4a4b0ea6f1',
  '4936f01a-a441-4d4e-acb6-83a310bcce9b',
  '689dd69e-db62-4e4a-9089-94a3d2c4f8bd',
  '9c510b7e-47ac-41d4-aef9-87e73c1be00a',
  '333bf9fa-9dac-48d5-9ad1-8f925fc5f3d0',
  '407aaa2f-585a-4501-a22e-a85c0f9fff12',
  'f988739d-49a7-437b-a5ae-05a31e12610f',
  '12e46ed2-8438-447d-ad31-3126fa734bad',
  'cba07192-0d38-4dc1-8a81-ddfa546e7565',
  '3ccdf7c0-62bf-41e0-b7b8-e6c411a116c8',
  '39ae307f-dac3-4810-a72e-d96da1f67122',
  'c8af3413-fd31-4b9f-aff9-ee20f5eab044',
  'ac70732a-7f0c-4018-9034-3b9fa80bd8de',
  '80784a8a-0845-475e-be07-4f47ff80d729',
  '46410a13-f578-4954-8a4f-31a8148d6858',
  'ea334bf1-0c71-4639-a283-5bcc0efff411',
  '3ad6c5b1-2aa0-405d-8d8d-ec107407e226',
  '77a761d6-7689-488c-abc3-6bc74a03f82b',
  '2c9fbf84-0b82-48c5-b060-b8e0e2641fda',
  '5db701cf-d2ee-4bf3-abd0-5bf81e62835a',
  'd9844add-3180-4bca-82ed-dcff7fec40e9',
  '16880d44-16aa-4c11-bfe1-636db56779cd',
  'b82afb46-1664-4840-ab60-8bf365e46e5a',
  '7a10da3a-9227-4126-a41e-c98c7e38ae94',
  'df32b503-21c6-458f-90e0-9ea51cbc6e3f',
  '0489acf4-d369-4603-bc31-dcf2285c988e',
  '26b78e5f-0d99-44e6-9492-1c7ef6b5c7ba',
  '9849f2b5-566a-4d08-93e7-20bb9dcd2c11',
  'b048da3c-75c0-4fe9-8d92-a7ed5811f1bd',
  'e51fdb29-b873-4327-841c-a814d3b991c9',
  '0c0ed7ee-9d16-49fd-8aaf-ce6b4519efab',
  '555ee700-ff16-4d1e-be9a-079e66ce99b2',
  'af2384a5-402f-4008-aebf-dedc02d0c2d6',
  '73718eda-5fcd-4d38-97c6-59be11e97000',
  'bcb5e585-3476-4301-ac2f-c55823124283',
  'cc07d947-a986-45c1-8444-63bf22f0221b',
  'c237955a-3302-4617-a203-3a16fd6e2d94',
  '7a9d2ab9-acd2-4aa3-b3a7-865eaa33068b',
  '6a6f5a61-dbff-4946-9144-b7803488a7cb',
  '2513ebea-8303-4b78-b9ac-9993d610c6fe',
  'c094e983-82a6-4a36-b5a0-2c25b843adb5',
  '091f9336-2c79-4f19-8217-303ca2aa8c6e',
  'e1c9c077-7a9c-44b6-980b-eaa7f4f08ae4',
  '93921b7b-e4fa-40c8-9994-5f845fc72b36',
  'dfd92e99-4d37-46f3-aa45-f4c122f0bb92',
  'a6e6143f-f211-4424-a1b7-9b0555d54f35',
  'a1a7f6fc-d376-4393-8e3b-dae1fbe8f23c',
  'ee485f54-be77-4644-a309-438b898165f9',
  'a5af4086-8667-4918-b065-83f151ee51a1',
  '6e40b876-0db1-4149-8637-7c67eaa5a839',
  'b762d200-ee8e-44fa-a2d7-9f18e1dc56f4',
  'ade5bf32-f733-46d7-af48-d54d6d33a5df',
  '6f53b075-227b-44c0-a669-941450565b6b',
  '7dfe5b21-054f-4591-a4fe-846268c95145',
  'c8968503-cbe5-463c-8ad0-c39819112629',
  '801dc1d2-90a6-4b46-bd80-36b97a4a1b76',
  '79029fdb-482d-4e9b-9f86-c31b447ecc2e',
  '8ced1525-5e0f-4579-84d4-cd71eca48e89',
  '99a8815a-f6b9-4a42-adc8-ee480675a414',
  '1ecc22dc-4dc9-4123-b7e6-1e3d1eff82fd',
  '8e41e0e2-43db-4c9f-a6c7-9df89a3ff719',
  '279b1561-1436-48b2-ba50-6c8b080363e9',
  '12ee45a2-a8c4-47d7-8cb1-6e775838b6a4',
  '0cc6f37a-515f-490e-8b84-9817812dcf6d',
  '525fbf47-3a43-4a04-92f3-34071aaeff1f',
  '2dd15ede-af03-457e-b7b6-a0bc3bad9a56',
  '79b92bdb-0109-44f6-8907-39b688db4981',
  '8cf20186-8e45-4ed5-9c71-63b6343cbdfc',
  '087e68e5-a271-4aac-ad14-2154dc2392c6',
  '3281bcea-21c0-4c43-b952-1ec9ff001f97',
  'afe90902-2a48-47d2-8923-6ca8bc61ea84',
  'f0130e2d-50ad-4357-afdf-f2a14ca69390',
  '6dfb6bb3-19a2-4696-a2ce-4f150bcdfb2a',
  '47d657a2-3a52-4913-a15d-370e83a52767',
  '09d5825d-b089-4bfe-ae87-eb4272112dc7',
  '78a19b26-09db-42ed-98c7-509afb463369',
  'e2188f3b-3164-42da-b4ec-4b5ab0af5648',
  'b2118f82-d607-4a2f-9d04-9290b0e30e5d',
  '9d73f5fd-557b-46e6-88cb-9e46b220280f',
  '0ecb8cbc-78c7-41ac-9395-de3aa708b5d7',
  '6abc9b58-bd4e-4ac3-84ab-7ccd6286a4a7',
  '50fda12a-4d4e-4bf3-893b-502bf9792c27',
  'b8b09d22-1c79-4a45-8386-56139ce9ce36',
  'a2b0b4b0-04b1-4162-b673-3d48c2e5d0c8',
  '06cec523-4e40-443e-a10b-7ae0b42859b2',
  'b1e2ce91-4817-43db-b1ac-c58fad20a349',
  'bcbef67e-4cfc-44cb-9908-7135acdb71bd',
  '0885aea1-9c03-4f43-84f6-b1f0bbb36e84',
  'b7c8821f-d569-4da8-bb9a-4c4375ace704',
  '19d7c4ba-c143-4251-beb3-380b272a8051',
  '5b3a36e1-9a00-42b4-bfb9-422d4ebb5182',
  '2dbeba85-ba57-4293-b78d-f290fb83192c',
  'e34e9ad6-80bd-4aec-90a6-619f704aafc0',
  '90a680af-ada5-4c1c-b287-bdd18afb3514',
  'ac70a318-0093-4a5e-997a-8d4171977765'
);
