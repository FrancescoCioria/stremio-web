// Copyright (C) 2017-2023 Smart code 203358507

const { useCallback } = require('react');
const { useTranslation } = require('react-i18next');

// Il nostro addon di liste (launcher/backend/src/stremio_addon.ts).
const CASA_ADDON_ID = 'casa.home.lists';

const useTranslate = () => {
    const { t } = useTranslation();

    const string = useCallback((key) => t(key), [t]);

    const stringWithPrefix = useCallback((value, prefix, fallback = null) => {
        const key = `${prefix}${value}`;
        const defaultValue = fallback ?? value.charAt(0).toUpperCase() + value.slice(1);

        return t(key, {
            defaultValue,
        });
    }, [t]);

    const catalogTitle = useCallback(({ addon, id, name, type } = {}, withType = true) => {
        if (addon && id && name) {
            const partialKey = `${addon.manifest.id.split('.').join('_')}_${id}`;
            const translatedName = stringWithPrefix(partialKey, 'CATALOG_', name);

            // Casa: sulle NOSTRE righe niente suffisso di tipo.
            // ⚠️ Serve per le righe MISTE: un catalogo dichiara un solo `type`,
            // ma le meta portano il proprio (verificato: il core costruisce
            // `#/detail/series/tt…` per una serie dentro un catalogo `movie`),
            // quindi una riga sola puo' tenere film E serie — e "Novita' -
            // Movie" sarebbe una didascalia FALSA. Sulle nostre il tipo non
            // serve comunque: il nome lo dice gia'.
            const isCasaCatalog = addon.manifest.id === CASA_ADDON_ID;

            if (type && withType && !isCasaCatalog) {
                const translatedType = stringWithPrefix(type, 'TYPE_');
                return `${translatedName} - ${translatedType}`;
            }

            return translatedName;
        }

        return null;
    }, [stringWithPrefix]);

    return {
        string,
        stringWithPrefix,
        catalogTitle,
    };
};

module.exports = useTranslate;
