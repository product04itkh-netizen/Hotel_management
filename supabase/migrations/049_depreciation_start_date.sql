-- ============================================================
-- Migration 049: Depreciation start date
--
-- The schedule decided when an asset starts depreciating from its
-- purchase date, but the workbooks carry an explicit "Start date" column
-- and every one of the 169 depreciable rows across both branches says
-- August 2026. Because most of these assets were bought in 2025 or early
-- 2026, the schedule began depreciating them in January and by August was
-- seven months into the declining balance -- showing $849.96 for Srae
-- Ambel's buildings where the workbook says $875.17, and an annual figure
-- of $10,264.70 against the workbook's $875.17.
--
-- Adds the column and loads it from the sheets. Assets the sheets do not
-- name fall back to 2026-08-01, the date every other row uses.
-- Land carries no start date; it is not depreciable.
-- Safe to re-run.
-- ============================================================

ALTER TABLE fixed_assets ADD COLUMN IF NOT EXISTS depreciation_start_date DATE;

-- ─── KAMPOT ───────────────────────────────────────────
UPDATE fixed_assets SET depreciation_start_date = '2026-08-01' WHERE id IN (
  '52db631f-2675-4087-bb28-a5bae5aa7f66',
  'eb4a2669-7fbe-47f5-85b6-be57893c3421',
  '03bc34b6-fe03-4c76-8efc-8911142306e1',
  '1052a40d-33f1-45cb-97f4-221f5aa08627',
  'e5230d64-bf04-4d37-9b18-a2c647df124b',
  '305971b7-4da5-46f9-a596-33c09e740d5f',
  'b8d979fb-f77e-46a6-a0da-e26cd538be54',
  '8a0f7122-f9ca-4e7c-bf3b-aa0c0ad33aa9',
  '85e19b10-f82d-48b9-9e93-d55b0b79b331',
  '1bb746b6-aba1-49d0-86df-41a8165e6266',
  '2cca3939-3220-47a6-8b35-bf797f99febe',
  '5c728f91-68e6-4bd5-8629-e52172ad7d20',
  '90de1f5a-f73f-4cfb-b5f0-2378ea957d1e',
  'd9c9b841-0ac7-4a37-b943-5c85f568b408',
  '0e6eb62a-2cda-4e59-b08e-e3e96e3a83fc',
  '60202b77-ad19-450d-be40-b677472d6906',
  '50b5f430-5a05-406d-8130-286b69cd43e3',
  'b74f710a-dc3c-43c4-b671-714b5c2af308',
  '0651ad09-97b0-4983-9daf-38c84f336ad6',
  '3b662bcc-0057-443c-a65c-a20eed71b9bc',
  '7d5c0169-41a3-4073-89ff-125a15bc7bfe',
  'f46d448f-97f4-4024-b240-7fd08eba8f6a',
  '36e5e2d0-6571-455b-a8a8-4607098e200c',
  'eb023582-31df-4918-b954-c4c62b4bcfa1',
  '67c48973-ff38-4c99-b89c-d8aa6b06d3e8',
  'b1ac76b0-74a6-4145-ab90-97dc0d0b9b71',
  '7daf4dbd-24e8-489a-b200-f73d76e38435',
  '2bd8d556-32d6-4293-8837-916eae4588c8',
  'fc5fc14f-126d-4582-85aa-02ac92ec7591',
  '468e7fa6-6af5-4a2c-94f0-28c283d66a15',
  '927d43ac-ee7a-40ec-90a5-300a4e272337',
  '76d2c7cc-6ade-4b5e-87d6-37ff8244ef2f',
  'dfefaee9-0252-49c8-88bf-be86904a5987',
  'dc490935-d0a1-44e1-866a-88b2d70e6393',
  'b17f0855-494b-4607-88d5-a68652101ac6',
  '12dd7cfd-5dc9-4ae6-877f-341afcd53a17',
  '21a76348-c5d6-4ea4-9ecd-344f3fbc3392',
  'a19ee76d-cd21-4c39-bedc-d2dc930a0f14',
  '7bfbcd7e-be9e-473c-8f5f-b0ce20a5815f',
  '425310a8-c9c7-41e1-b340-b0af1ed26311',
  '3f85dccb-72c4-4aeb-a509-d94ba765a61d',
  '8deb6804-adae-4c52-88df-b294238915a7',
  'a48e497f-1a2c-48bb-aa2a-bfb8896c30c2',
  'c6fdcbd6-6085-43c8-8593-4dd3b1f982a1',
  '97b2f7ec-066d-45a7-b474-cb8b400fbbe5',
  'dd99db6f-46ec-4e6f-8d1e-f8c44dd26f6d',
  '16c1b46d-fc8c-49ef-9804-a9a6442d712c',
  '725fb2a2-39ff-4ec5-8c0e-967a5bcac967',
  'a76331e8-a104-423e-bc07-d0db2cfec68c',
  '58ecc559-e7b3-4746-9518-a3f50493fc24',
  '53352e3a-ae5a-42a9-9583-cf3701f46186',
  'a13e092a-fe55-4eef-abef-297867c57cdb',
  'bb0cce9e-dd0e-43e2-9b2d-ef768f4354bd',
  'b96a1519-3c8e-4627-844a-66668ad00bb5',
  '121886f8-c2ea-48f0-834d-8b2450a71246',
  'ea1cd5cb-11af-4c4b-85c5-240505161cca',
  'bf1dc132-7e4c-4884-9a78-3793cea4e7fe',
  '4261520b-924a-4f71-b021-86d2d3d65e34',
  '021513d6-0180-4653-92a8-276b20b2a651',
  '65468778-7a47-4194-82df-e589460a29aa',
  'b779b9eb-0dcc-4810-882b-6433e782c9e9',
  'a9911ca9-8bed-4fae-99ec-2ae826753c80',
  '965ff983-5b74-4f74-9142-ee0185e8e2fe',
  'd56da25d-3eb2-44d6-a5b1-34b5433e371e',
  '9160d2b3-7858-42dc-bc76-5984d03e108d',
  '3f244f71-1810-4ae3-98d1-fa68585ff05a',
  '49ff8a72-2468-4f90-b1f9-1faa440efccb',
  'f4b24192-8972-4000-8cdb-c9c80de47ab2',
  '2e53f122-5a16-4fe7-9d07-d276f203de3e',
  'f3193427-3668-4438-9d83-49bc091c995a',
  'fb7edb6d-aff4-4686-b2ec-584b274398e0',
  '2a9ac3f4-d62e-430d-b3fd-9e75f3b066e3',
  '8794d3c7-db8d-4887-a1fd-39e6a8aed5cc',
  '462b390f-e969-4a09-958f-2067e85a9559',
  '95573ed5-e397-4ae9-9b9a-9035fc8b068f',
  '46d3c055-c04d-4d4b-9acc-9e24d3ce5735',
  'ff241daf-9d33-44bb-be0a-63e554bffbd0',
  '55eeac2b-3ef5-47fe-878f-820df7cee495',
  '7b690d9e-d275-4227-bc9f-f62e2a3a4fd6',
  '84cbe277-5704-456f-8fc0-dac328448a9b',
  '06f53691-6300-4072-a979-36f31d3d7724',
  'd621d95f-1a3b-4e2c-926b-6d8b6161ba83',
  '450cbc8e-5c03-4add-bc45-f10da35dbc4f',
  '58637760-bd63-49c4-a561-a901151dfbf4',
  '37dca253-cfe8-452b-afe1-9ee91e666ccf',
  '87c2f727-6dac-453c-80e0-0da419884626',
  'f5dd2d9d-eb6c-4be5-8ea9-c1ab05af65ff',
  '7dfc8ad6-97bf-448c-8a90-8c18e248db5a',
  'c868c8ef-89c7-4441-8eb8-128de059f368',
  '12727b14-6444-4ba8-bc49-34b90be0f2bc',
  '72fd8e3a-c711-49fa-938c-a8d77358c304',
  '160a4d50-56fe-4002-9d61-f90ef837073f',
  '83fe5555-3f5b-49b2-a008-0fc99916a3d8',
  '15326812-4d77-4419-924f-f8f0255ab032',
  'ffe27c47-e9d5-48a7-aa0b-1ef6b4259f39',
  '5a84b2f4-3c1e-49e0-8d12-74e5b24d4212',
  '54e3c490-ff28-4e4c-a824-13ed656c95f5',
  'a01d8f10-9a34-4848-9283-cd3c3c354475',
  '66e46d60-2d41-4e41-a343-4c5afcdce1c7'
);
UPDATE fixed_assets SET depreciation_start_date = '2026-08-09' WHERE id IN (
  '93e6a6e5-1002-496a-adf5-a76bd34191fb'
);
UPDATE fixed_assets SET depreciation_start_date = '2026-08-10' WHERE id IN (
  'edc5a644-a02b-4480-9ef7-a22d8498fe2b'
);
UPDATE fixed_assets SET depreciation_start_date = '2026-08-11' WHERE id IN (
  'dda92126-2292-4777-be76-f7dbefc00929'
);
UPDATE fixed_assets SET depreciation_start_date = '2026-08-12' WHERE id IN (
  '49a75dc6-7b3a-4562-84ae-c51a607e6ab2'
);

-- ─── SRAE ───────────────────────────────────────────
UPDATE fixed_assets SET depreciation_start_date = '2026-08-01' WHERE id IN (
  '2d28ca9c-22e5-4e64-b2d3-572c71f386a9',
  'e9865311-881b-4e60-a19d-debc42866c51',
  'f044d064-6920-48f9-985e-3be8cc769afc',
  '3e51d5d0-93b4-4a71-b2f7-35481721cb73',
  'b56c706e-fdb8-4ce4-a947-9ee39989ef2e',
  '5e94bd24-cb9a-4692-9049-55add4be36ba',
  '49abb9e7-02ed-43fe-9e3b-0be976999ec7',
  'faebc714-2fd2-4b63-988d-b57841f3e093',
  'cedc2da0-bc5b-410c-a58d-5229d43c6091',
  'aeed6cb3-b4d0-4280-a01c-4bf411a0cb29',
  '1a540846-885d-4f20-8a31-3529b5688afe',
  'f9c73ec5-391e-4065-ba9d-18ca86f35e4f',
  '98d0df27-d707-46e2-a3e3-2871279415f0',
  '1b4e3539-76d7-478c-b1fb-ebd79325511f',
  '6a1f48d4-1dba-4aad-aec6-96ad3cc7f443',
  '9b73420b-2814-4302-b38f-41a5e8e90e9e',
  'fb67270a-6693-4ef2-987b-dd1bc54df576',
  'dd61f244-4487-4fe6-b969-9e565d2c91bf',
  '60a99114-fb6d-443b-82f4-b1e17b034483',
  '2f82ddfb-52b5-4ec2-b6f8-af498c74985b',
  'b92e7a7b-3089-452d-9676-312a9daa9f83',
  '0627afed-1741-48e5-9dc7-48720d991686',
  '6e05f1c4-c49e-4cc4-8cee-572a64439fda',
  'f2c4662d-c0f5-4e01-aaeb-6627a765a3e8',
  '85b103f1-6bf8-4376-b777-530db939332b',
  '0e6bc02d-bd38-43a4-a399-8a5790d6a175',
  '7fac61bf-69f9-4dfa-a890-50f2d1499e50',
  'ac470c4f-4817-4e80-bd03-b2fa88865304',
  '497979bd-392b-4633-8e68-eceebbc7f0b7',
  'a7748666-4561-4c7f-b7d1-e1c329bf396b',
  'e6575935-bef5-4840-b88c-efeeb9c0c30c',
  '7570e39b-f162-49c5-abb1-ac08d917096f',
  '6fd14441-fbea-465e-8b04-0cd4e244ee87',
  '744fc131-5628-41d4-86c9-4faaecdd5857',
  'be517488-054d-4429-baa0-d55d7817d6dd',
  'ba857d73-d189-4e8f-958a-dabde402fa5a',
  '2189c4b7-4a51-4a7c-b5f5-02ec7d83fab6',
  '0e832969-f648-4c66-be68-9795f43626df',
  '1555ab70-1444-43e2-b4fb-5a9bd825f791',
  '8e9965f8-7fa7-4d98-a793-3deb868c2cc1',
  '2db2b464-9278-4e69-8c5b-912f20f82a72',
  'f05c1591-ab50-49c8-874e-5e8759f7dc8b',
  '28d7763b-d630-4a45-a633-1ca5ed39aabc',
  '1c643f65-e986-4777-b0c2-238c33e88d10',
  '60bbd721-df11-451e-8147-e15fa6666cb7',
  '8dd1a460-f29a-429b-bfb1-fcc77b491266',
  '533b2494-f908-428a-bcfb-486681a68e14',
  'c5774130-a036-40c1-aa92-54ce907a783e',
  'c9f6b09e-32e9-4d38-a28f-0c7cb43144f0',
  '1f6bcf82-47c6-48e0-8e75-0e555ac411dc',
  'b7cf0bbf-0863-4695-95ca-14e6dc710dd3',
  '043049ba-9941-44ec-af21-2ff8dbd79091',
  'ad0806c5-ff0b-4f36-8328-75c0378900bb',
  '963118e9-62f5-4949-b3bd-e2f62d4ee8fd',
  '62a6387b-b1c8-437b-b436-7fe5e94a9fd9',
  'cdfb4653-20e0-4688-b1f8-122601f1f2d7',
  '339339af-74fb-498c-9bfe-45712bcc51b2',
  'd57bc0bd-4970-43d2-9a4b-837ca8ada1b8',
  '1a932682-5f48-4d3a-800d-98b0f3258a7b',
  'b2540f1c-82f4-4f8f-9819-c7b853b4be1f',
  'ed92a4e0-7510-4f73-9014-3be2ff0f26e0',
  '1481f66e-5f1b-4660-8281-90da6bbfa348'
);
UPDATE fixed_assets SET depreciation_start_date = '2026-08-02' WHERE id IN (
  '7d6af3d6-fb2d-4428-8d84-dfbdad67f241'
);
UPDATE fixed_assets SET depreciation_start_date = '2026-08-03' WHERE id IN (
  '22157a68-f257-4617-af6a-27429697ded8'
);
UPDATE fixed_assets SET depreciation_start_date = '2026-08-04' WHERE id IN (
  '7ca7479b-5298-4c44-8afd-3c60efccb3d7'
);
UPDATE fixed_assets SET depreciation_start_date = '2026-08-05' WHERE id IN (
  '36160e6b-5bda-4340-8dec-f36ff46dfab1'
);

-- Any depreciable row still without one (e.g. added later) gets the same default.
UPDATE fixed_assets SET depreciation_start_date = '2026-08-01'
  WHERE depreciation_start_date IS NULL AND is_depreciable;
