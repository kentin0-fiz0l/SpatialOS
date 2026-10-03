import ipaddress

import pytest

from watchdog_proxy.devices import Inventory, load_devices

INV = Inventory(load_devices([
    {"name": "hue", "host": "192.168.1.50", "skill": "gadget-philips-hue-bridges",
     "credential": {"header": "hue-application-key", "env": "HUE_APP_KEY"}},
    {"name": "printer", "host": "10.0.0.9"},
]))


def ip(s):
    return ipaddress.ip_address(s)


def test_listed_lan_device_passes():
    assert INV.blocks(ip("192.168.1.50")) is None
    assert INV.blocks(ip("10.0.0.9")) is None


def test_unlisted_lan_address_blocked():
    assert "not in the device inventory" in INV.blocks(ip("192.168.1.74"))
    assert INV.blocks(ip("172.16.5.5"))


def test_public_addresses_are_not_the_inventorys_business():
    assert INV.blocks(ip("93.184.215.14")) is None


def test_empty_inventory_blocks_all_lan():
    assert Inventory([]).blocks(ip("192.168.1.1"))


def test_device_credential_is_scoped_to_its_address():
    (cred,) = INV.credentials()
    assert cred.header == "hue-application-key" and cred.hosts == ("192.168.1.50",)


def test_host_must_be_an_ip():
    with pytest.raises(ValueError, match="device 0.*IP address"):
        load_devices([{"name": "x", "host": "hue.local"}])


def test_missing_fields_named():
    with pytest.raises(ValueError, match="device 0: missing 'host'"):
        load_devices([{"name": "x"}])
    with pytest.raises(ValueError, match="credential missing 'env'"):
        load_devices([{"host": "10.0.0.1", "credential": {"header": "h"}}])
